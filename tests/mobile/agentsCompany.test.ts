import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function harness(role = 'admin', create?: (body: unknown) => Promise<unknown>) {
  const state: unknown[] = []; let cursor = 0, tree: any, refreshed = 0;
  const calls: unknown[] = [], alerts: string[] = [];
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: {
      useState(initial: unknown) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value: any) => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
      useRef(initial: unknown) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
      useCallback: (fn: unknown) => fn,
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value: unknown) => value } },
    'expo-router': { useFocusEffect() {} },
    '../lib/api': { api: { users: async () => ({ users: [] }), createUser: async (body: unknown, token: string) => { assert.equal(token, 'company-session'); calls.push(body); return create ? create(body) : { user: { id: 5, businessId: 11, name: 'Agente', username: 'agente', role: 'seller' } }; } } },
    '../context/AuthContext': { useAuth: () => ({ token: 'company-session', user: { id: 1, businessId: 11, role } }) },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {} }) },
    '../lib/feedback': { feedback: { alert: (title: string) => alerts.push(title) } },
    './FormModal': { FormModal: 'FormModal' }, './PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/components/TeamUsers.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports: any = {};
  runInNewContext(outputText, { exports, require: (key: string) => { assert.ok(key in modules, key); return modules[key]; } });
  const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];
  const find = (type: string, label?: string) => { const node = nodes(tree).find(n => n.type === type && (!label || n.props.accessibilityLabel === label)); assert.ok(node, type + ' ' + label); return node.props; };
  const render = () => { cursor = 0; tree = exports.TeamUsers({ onCreated: () => { refreshed++; } }); };
  const fill = (name = ' Agente ', username = ' agente ', password = 'test-only-12345') => {
    find('TextInput', 'Nombre del vendedor').onChangeText(name); find('TextInput', 'Usuario del vendedor').onChangeText(username); find('TextInput', 'Contraseña del vendedor').onChangeText(password); render();
  };
  render();
  return { calls, alerts, render, fill, save: () => find('PrimaryButton').onPress(), modal: () => find('FormModal'), refreshed: () => refreshed, visible: () => tree !== null };
}

test('registrar vendedor envía solo credenciales, evita doble envío y refresca los agentes', async () => {
  let finish!: (value: unknown) => void;
  const app = harness('admin', () => new Promise(resolve => { finish = resolve; }));
  app.fill(); const first = app.save(), second = app.save();
  assert.equal(app.calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls[0])), { name: 'Agente', username: 'agente', password: 'test-only-12345' });
  finish({ user: { id: 5, name: 'Agente', username: 'agente', role: 'seller', businessId: 11 } });
  await Promise.all([first, second]); app.render();
  assert.equal(app.refreshed(), 1); assert.equal(app.modal().visible, false);
  assert.deepEqual(app.alerts, ['Vendedor registrado']);
});

test('un error al registrar conserva el formulario y permite reintentar', async () => {
  let attempts = 0;
  const app = harness('admin', async () => { if (++attempts === 1) throw Error('Usuario ocupado'); return { user: { id: 5 } }; });
  app.fill(); await app.save(); app.render(); await app.save();
  assert.equal(app.calls.length, 2); assert.equal(app.refreshed(), 1); assert.deepEqual(app.alerts, ['Error', 'Vendedor registrado']);
});

test('solo el administrador ve el registro y se validan los límites del servidor', async () => {
  assert.equal(harness('seller').visible(), false);
  const app = harness();
  for (const values of [['a', 'agente', '12345678'], ['Agente', 'no espacios', '12345678'], ['Agente', 'agente', '1'.repeat(73)]]) { app.fill(values[0], values[1], values[2]); await app.save(); }
  assert.equal(app.calls.length, 0); assert.equal(app.alerts.length, 3);
});
