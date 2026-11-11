import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

type Session = {
  user: { id: number } | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

// Execute the actual provider with in-memory native storage and a controlled server.
function authHarness(remoteLogout: (token: string) => Promise<unknown>, connected = true) {
  const storage = new Map<string, string>();
  const states: unknown[] = [];
  let cursor = 0;
  const react = {
    createContext: () => ({ Provider: 'AuthProvider' }),
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value: unknown) => { states[index] = value; }];
    },
    useEffect() {},
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
  };
  const modules: Record<string, unknown> = {
    react,
    'react/jsx-runtime': { jsx: (_type: unknown, props: unknown) => props },
    'expo-secure-store': {
      async setItemAsync(key: string, value: string) { storage.set(key, value); },
      async deleteItemAsync(key: string) { storage.delete(key); },
    },
    '../lib/api': {
      ApiError: Error,
      api: { async login({ username }: { username: string }) { return { user: { id: 1 }, token: 'token-' + username }; } },
    },
    '../lib/backend': { IS_NOVALED: connected, STORAGE_NAMESPACE: 'test' },
    '../lib/novaled': { novaled: { logout: remoteLogout } },
    '../lib/authEvents': { subscribeSessionExpiry() {} },
    '../lib/legacyOperation': { bindLegacySession() {}, configureLegacyStorage() {} },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/context/AuthContext.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {} as { AuthProvider: (props: { children: null }) => { value: Session } };
  runInNewContext(outputText, {
    exports,
    require(name: string) {
      assert.ok(name in modules, 'Unexpected dependency: ' + name);
      return modules[name];
    },
  });
  return {
    storage,
    session() { cursor = 0; return exports.AuthProvider({ children: null }).value; },
  };
}

for (const failure of ['Sin conexión', 'Tiempo de espera agotado', 'Error del servidor']) {
  test('cerrar sesión borra el acceso local aunque falle Novaled: ' + failure, async () => {
    const calls: string[] = [];
    const auth = authHarness(async token => { calls.push(token); throw new Error(failure); });
    await auth.session().login('asesor', 'password');
    assert.equal(auth.storage.size, 1);

    await assert.doesNotReject(() => auth.session().logout());

    assert.equal(auth.session().user, null);
    assert.equal(auth.session().token, null);
    assert.equal(auth.storage.size, 0);
    assert.deepEqual(calls, ['token-asesor']);
  });
}

test('cerrar sesión no espera al servidor ni borra una sesión nueva al recibir la respuesta anterior', async () => {
  let rejectRemote!: (error: Error) => void;
  const pending = new Promise<void>((_resolve, reject) => { rejectRemote = reject; });
  const auth = authHarness(() => pending);
  await auth.session().login('anterior', 'password');
  let finished = false;
  const logout = auth.session().logout().then(() => { finished = true; });

  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(finished, true, 'El cierre local debe terminar sin esperar la respuesta remota');
  assert.equal(auth.session().token, null);
  assert.equal(auth.storage.size, 0);
  await auth.session().login('nuevo', 'password');
  rejectRemote(new Error('La petición anterior falló'));
  await logout;
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(auth.session().token, 'token-nuevo');
  assert.equal(auth.storage.get('test_token'), 'token-nuevo');
});

test('el modo Lumis cierra la sesión sin llamar al servidor de Novaled', async () => {
  let remoteCalls = 0;
  const auth = authHarness(async () => { remoteCalls++; }, false);
  await auth.session().login('asesor', 'password');

  await auth.session().logout();

  assert.equal(auth.session().user, null);
  assert.equal(auth.session().token, null);
  assert.equal(auth.storage.size, 0);
  assert.equal(remoteCalls, 0);
});
