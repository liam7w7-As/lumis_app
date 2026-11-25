import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const user = { id: 5, businessId: 8, name: 'Vendedora', username: 'ana', email: null, role: 'seller', themeMode: 'dark' };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const cached = (token: string, data = user) => JSON.stringify({ version: 1, token, user: data });
class ApiError extends Error { constructor(public status: number) { super('Network or authentication failure'); } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(next => { resolve = next; }); return { promise, resolve }; }

function harness(options: {
  storage?: Map<string, string>; me?: (token: string) => Promise<any>; login?: (body: any) => Promise<any>;
  open?: () => Promise<void>; connected?: boolean;
} = {}) {
  const storage = options.storage ?? new Map<string, string>();
  const hooks: any[] = []; let cursor = 0, tree: any, effects: (() => void)[] = [], expiry: ((token: string) => void) | undefined;
  let meCalls = 0, closed = 0; const opened: { user: any; token: string }[] = [], logins: any[] = [];
  const jsx = (_type: unknown, props: unknown) => props;
  function memo(factory: () => unknown, deps: unknown[]) {
    const index = cursor++; const previous = hooks[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) hooks[index] = { value: factory(), deps };
    return hooks[index].value;
  }
  const modules: Record<string, unknown> = {
    react: {
      createContext: () => ({ Provider: 'AuthProvider' }),
      useState(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], (value: unknown) => { hooks[index] = value; }]; },
      useRef(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
      useCallback: (value: unknown, deps: unknown[]) => memo(() => value, deps), useMemo: memo,
      useEffect(callback: () => (() => void) | void, deps: unknown[]) {
        const index = cursor++; const previous = hooks[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => { previous?.cleanup?.(); hooks[index] = { deps, cleanup: callback() }; });
      },
    },
    'react/jsx-runtime': { jsx },
    'expo-secure-store': {
      async getItemAsync(key: string) { return storage.get(key) ?? null; },
      async setItemAsync(key: string, value: string) { storage.set(key, value); },
      async deleteItemAsync(key: string) { storage.delete(key); },
    },
    '../lib/api': { ApiError, api: {
      async me(token: string) { meCalls++; return options.me ? options.me(token) : { user }; },
      async login(body: any) { logins.push(body); return options.login ? options.login(body) : { user, token: 'server-token-' + body.username }; },
      async register(body: any) { logins.push(body); return { user: { ...user, role: 'admin' }, token: 'registered-token' }; },
    } },
    '../lib/backend': { IS_NOVALED: !!options.connected, STORAGE_NAMESPACE: 'test' },
    '../lib/novaled': { novaled: { async logout() {} } },
    '../lib/authEvents': { subscribeSessionExpiry(callback: (token: string) => void) { expiry = callback; return () => { expiry = undefined; }; } },
    '../lib/legacyOperation': { bindLegacySession() {}, configureLegacyStorage() {} },
    '../offline/runtime': { async openOfflineSession(user: any, token: string) { opened.push({ user, token }); await options.open?.(); }, closeOfflineSession() { closed++; } },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/context/AuthContext.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } });
  const exports: any = {};
  runInNewContext(outputText, { exports, require: (key: string) => { assert.ok(key in modules, key); return modules[key]; } });
  function render() { cursor = 0; effects = []; tree = exports.AuthProvider({ children: null }); effects.forEach(run => run()); return tree.value; }
  render();
  return { storage, opened, logins, render, session: () => tree.value, meCalls: () => meCalls, closed: () => closed,
    expire: (token: string) => expiry?.(token),
    async settle() { await tick(); render(); await tick(); return render(); },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}

for (const connected of [false, true]) test(`${connected ? 'Novaled' : 'Lumis'} reabre la sesión recordada sin ninguna petición HTTP`, async () => {
  const storage = new Map([['test_token', 'saved-token'], ['test_token_user', cached('saved-token')]]);
  const app = harness({ storage, connected, me: async () => { throw new ApiError(0); } });
  const session = await app.settle();
  assert.equal(session.token, 'saved-token'); assert.equal(session.user.businessId, 8); assert.equal(session.loading, false);
  assert.equal(app.meCalls(), 0); assert.equal(app.opened.length, 1); assert.equal(app.opened[0].token, 'saved-token');
});

test('el primer inicio es online y guarda un usuario validado, nunca la contraseña', async () => {
  const app = harness(); await app.settle();
  await app.session().login('ana', 'password-not-to-persist'); app.render();
  assert.equal(app.logins.length, 1); assert.equal(app.session().token, 'server-token-ana');
  assert.ok(!JSON.stringify([...app.storage.values()]).includes('password-not-to-persist'));
  const snapshot = JSON.parse(app.storage.get('test_token_user')!);
  assert.equal(snapshot.user.id, 5); assert.equal(snapshot.user.businessId, 8); assert.equal(snapshot.token, app.storage.get('test_token'));
  app.unmount();
  const reopened = harness({ storage: app.storage, me: async () => { throw new ApiError(0); } }); await reopened.settle();
  assert.equal(reopened.meCalls(), 0); assert.equal(reopened.session().user.id, 5);
});

test('registrar una cuenta exige servidor y recuerda el usuario para la siguiente apertura offline', async () => {
  const app = harness(); await app.settle();
  await app.session().register('ana', 'Empresa nueva', 'password-not-to-persist'); app.render();
  assert.equal(app.logins.length, 1); assert.equal(app.session().user.role, 'admin');
  assert.equal(JSON.parse(app.storage.get('test_token_user')!).token, 'registered-token');
  assert.ok(!JSON.stringify([...app.storage.values()]).includes('password-not-to-persist'));
});

test('una instalación anterior con solo token se migra tras una validación online', async () => {
  const storage = new Map([['test_token', 'legacy-token']]); const app = harness({ storage });
  await app.settle(); assert.equal(app.meCalls(), 1); assert.equal(app.session().token, 'legacy-token');
  assert.equal(JSON.parse(storage.get('test_token_user')!).token, 'legacy-token');
});

test('un token antiguo sin snapshot no inventa una sesión cuando no hay conexión', async () => {
  const storage = new Map([['test_token', 'legacy-token']]); const app = harness({ storage, me: async () => { throw new ApiError(0); } });
  await app.settle(); assert.equal(app.session().user, null); assert.equal(app.opened.length, 0); assert.equal(storage.get('test_token'), 'legacy-token');
});

test('un snapshot de otro token no restaura usuario ni empresa sin validación', async () => {
  const storage = new Map([['test_token', 'token-b'], ['test_token_user', cached('token-a')]]);
  const app = harness({ storage, me: async () => { throw new ApiError(0); } }); await app.settle();
  assert.equal(app.session().user, null); assert.equal(app.meCalls(), 1); assert.equal(app.opened.length, 0);
});

test('una revocación de la sesión activa cierra SQLite y limpia ambas credenciales', async () => {
  const storage = new Map([['test_token', 'token-a'], ['test_token_user', cached('token-a')]]); const app = harness({ storage }); await app.settle();
  app.expire('other-token'); await app.settle(); assert.equal(app.session().token, 'token-a');
  app.expire('token-a'); await app.settle(); assert.equal(app.session().token, null); assert.equal(app.closed(), 1); assert.equal(storage.size, 0);
});

test('salir durante una restauración online no permite que una respuesta tardía vuelva a iniciar sesión', async () => {
  const me = deferred<any>(); const app = harness({ storage: new Map([['test_token', 'legacy-token']]), me: () => me.promise });
  await tick(); app.render(); await app.session().logout(); me.resolve({ user }); await app.settle();
  assert.equal(app.session().user, null); assert.equal(app.opened.length, 0); assert.equal(app.storage.size, 0);
});

test('salir durante la apertura de SQLite cancela la publicación de esa sesión', async () => {
  const open = deferred<void>(); const storage = new Map([['test_token', 'token-a'], ['test_token_user', cached('token-a')]]);
  const app = harness({ storage, open: () => open.promise }); await tick(); app.render();
  assert.equal(app.opened.length, 1); await app.session().logout(); open.resolve(); await app.settle();
  assert.equal(app.session().token, null); assert.equal(storage.size, 0); assert.equal(app.closed(), 1);
});

test('salir antes de recibir un login impide que ese login tardío vuelva a abrir SQLite', async () => {
  const login = deferred<any>(); const app = harness({ login: () => login.promise }); await app.settle();
  const pending = app.session().login('ana', 'password'); await app.session().logout();
  login.resolve({ user, token: 'late-token' }); await pending; await app.settle();
  assert.equal(app.session().token, null); assert.equal(app.opened.length, 0); assert.equal(app.storage.size, 0);
});

test('dos logins simultáneos no permiten que el anterior sustituya la cuenta nueva', async () => {
  const old = deferred<any>();
  const app = harness({ login: body => body.username === 'anterior' ? old.promise : Promise.resolve({ user: { ...user, id: 12, businessId: 15 }, token: 'new-token' }) });
  await app.settle(); const first = app.session().login('anterior', 'password');
  await app.session().login('nuevo', 'password'); app.render();
  old.resolve({ user, token: 'old-token' }); await first; await app.settle();
  assert.equal(app.opened.length, 1); assert.equal(app.session().token, 'new-token'); assert.equal(app.session().user.businessId, 15);
  assert.equal(JSON.parse(app.storage.get('test_token_user')!).user.id, 12);
});

test('recordar desactivado no persiste el usuario al actualizar preferencias', async () => {
  const app = harness(); await app.settle(); await app.session().login('ana', 'password', false); app.render();
  app.session().updateUser({ ...user, name: 'Nombre nuevo' }); await app.settle();
  assert.equal(app.session().user.name, 'Nombre nuevo'); assert.equal(app.storage.size, 0);
});

test('actualizar el usuario recordado guarda sus cambios sin aceptar datos de otra empresa', async () => {
  const app = harness(); await app.settle(); await app.session().login('ana', 'password'); app.render();
  app.session().updateUser({ ...user, name: 'Nombre nuevo' }); await app.settle();
  assert.equal(JSON.parse(app.storage.get('test_token_user')!).user.name, 'Nombre nuevo');
  app.session().updateUser({ ...user, businessId: 99, name: 'Otra empresa' }); await app.settle();
  assert.equal(app.session().user.businessId, 8); assert.equal(JSON.parse(app.storage.get('test_token_user')!).user.businessId, 8);
});
