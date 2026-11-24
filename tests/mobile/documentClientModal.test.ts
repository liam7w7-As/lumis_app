import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { verifySavedDocumentClient } from '../../apps/mobile/src/lib/documentClient';

type Element = { type: string; props: Record<string, any> };
function modalHarness(save: (data: unknown) => Promise<void> = async () => {}) {
  const hooks: any[] = []; let cursor = 0, tree: Element, closed = 0;
  const source = readFileSync(new URL('../../apps/mobile/src/components/DocumentClientModal.tsx', import.meta.url), 'utf8');
  const exports: Record<string, any> = {};
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  const modules: Record<string, any> = {
    react: {
      useState(initial: unknown) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (v: unknown) => { hooks[i] = v; }]; },
      useRef(initial: unknown) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (v: unknown) => v } },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {} }) },
    './FormModal': { FormModal: 'FormModal' }, './PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { Error, exports, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  function nodes(value: any): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value?.props) return [];
    return [value, ...nodes(value.props.children)];
  }
  const render = () => { cursor = 0; tree = exports.DocumentClientModal({ initial: { name: 'Cliente', phone: null, email: null, address: null, nit: null }, onSave: save, onClose: () => { closed++; } }); };
  const input = (label: string) => nodes(tree).find(n => n.type === 'TextInput' && n.props.accessibilityLabel === label)!.props;
  const submit = async () => { nodes(tree).find(n => n.type === 'PrimaryButton')!.props.onPress(); await new Promise(resolve => setImmediate(resolve)); render(); };
  render();
  return { render, input, submit, closed: () => closed, close: () => tree.props.onClose(), error: () => nodes(tree).find(n => n.props.accessibilityRole === 'alert')?.props.children };
}

test('modal validates names and emails, preserves the last keystroke and normalizes cleared fields', async () => {
  const saved: any[] = []; const app = modalHarness(async data => { saved.push(JSON.parse(JSON.stringify(data))); });
  app.input('Nombre / Razón social').onChangeText('   '); await app.submit();
  assert.match(app.error(), /nombre del cliente/); assert.equal(saved.length, 0);
  app.input('Nombre / Razón social').onChangeText('  Proyecto Norte  ');
  app.input('Correo electrónico').onChangeText('invalid'); await app.submit();
  assert.match(app.error(), /correo/); assert.equal(saved.length, 0);
  app.input('Correo electrónico').onChangeText('  norte@example.com  ');
  app.input('Dirección').onChangeText('  ');
  await app.submit();
  assert.deepEqual(saved, [{ name: 'Proyecto Norte', phone: null, email: 'norte@example.com', address: null, nit: null }]);
  assert.equal(app.closed(), 1);
});

test('failed saves retain all fields, can retry, and never close while pending', async () => {
  let reject: (e: Error) => void = () => {}; let calls = 0;
  const app = modalHarness(() => { calls++; return new Promise((_resolve, r) => { reject = r; }); });
  app.input('Teléfono').onChangeText('71111111'); await app.submit();
  app.close(); await app.submit(); assert.equal(calls, 1); assert.equal(app.closed(), 0);
  reject(new Error('Sin conexión')); await new Promise(resolve => setImmediate(resolve)); app.render();
  assert.equal(app.error(), 'Sin conexión'); assert.equal(app.input('Teléfono').value, '71111111');
  await app.submit(); assert.equal(calls, 2);
});

test('an older API cannot silently claim that document client details were saved', () => {
  const details = { name: 'Proyecto', phone: null, email: null, address: null, nit: null };
  assert.throws(() => verifySavedDocumentClient(undefined, details), /servidor no confirmó/);
  assert.throws(() => verifySavedDocumentClient({ ...details, address: 'Dato anterior' }, details), /servidor no confirmó/);
  assert.doesNotThrow(() => verifySavedDocumentClient({ ...details }, details));
});
