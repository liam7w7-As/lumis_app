import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as scanReview from '../../apps/mobile/src/lib/quoteScan';
import type { QuoteScan } from '../../apps/mobile/src/lib/api';

type Element = { type: unknown; props: Record<string, unknown> };
type Effect = { deps?: unknown[]; cleanup?: () => void };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const response = (id: string): QuoteScan => ({ id, lines: [{ name: 'Lámpara', quantity: 2, unit: 'Unidad', unitPrice: 10,
  candidates: [], selectedProductId: null, match: 'none' }] });

// Execute the real modal with controlled native picking, requests and React commits.
function harness(add: (items: scanReview.ScannedQuoteItem[]) => Promise<void> | void = () => {}) {
  const hooks: unknown[] = [];
  let cursor = 0, effects: (() => void)[] = [];
  let visible = true, closeCalls = 0;
  const requests: { input: { scanId: string; base64: string }; result: ReturnType<typeof deferred<{ scan: QuoteScan }>> }[] = [];
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value: unknown) => { hooks[index] = typeof value === 'function' ? (value as (current: unknown) => unknown)(hooks[index]) : value; }];
    },
    useRef(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useEffect: effect,
    useLayoutEffect: effect,
  };
  function effect(callback: () => void | (() => void), deps?: unknown[]) {
    const index = cursor++, previous = hooks[index] as Effect | undefined;
    if (!previous || !deps || deps.some((value, i) => value !== previous.deps?.[i])) effects.push(() => {
      previous?.cleanup?.();
      hooks[index] = { deps, cleanup: callback() };
    });
  }
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const pick = async () => ({ uri: 'file:///private/photo.png', base64: 'image-bytes', ext: 'png' });
  const modules: Record<string, unknown> = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'Image', 'Pressable', 'Text', 'TextInput', 'View'].map(name => [name, name])),
      StyleSheet: { create: (value: unknown) => value } },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    '../lib/api': { api: { scanQuote(input: { scanId: string; base64: string }) {
      const result = deferred<{ scan: QuoteScan }>(); requests.push({ input, result }); return result.promise;
    } } },
    '../lib/media': { pickImageFromCamera: pick, pickImageFromLibrary: pick },
    '../lib/quoteScan': scanReview,
    '../context/BusinessContext': { useMoney: () => (value: number) => 'Bs. ' + value },
    '../theme/ThemeContext': { useTheme: () => ({ colors: { text: '#111111', muted: '#666666', primary: '#5842f4', border: '#cccccc', background: '#ffffff', error: '#cc0000' }, dark: false }) },
    './FormModal': { FormModal: 'FormModal' }, './PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/components/MagicQuoteScanModal.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {} as { MagicQuoteScanModal: (props: Record<string, unknown>) => Element };
  runInNewContext(outputText, { Error, exports, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  let tree: Element;
  const render = () => {
    cursor = 0; effects = [];
    const session = exports.MagicQuoteScanModal({ visible, token: 'session-user-one', onClose: () => { visible = false; closeCalls += 1; }, onAdd: add });
    tree = (session.type as (props: Record<string, unknown>) => Element)(session.props);
    effects.forEach(run => run());
    return tree;
  };
  function nodes(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object' || !('props' in value)) return [];
    const item = value as Element;
    return [item, ...nodes(item.props.children)];
  }
  function text(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(text).join('');
    return value && typeof value === 'object' && 'props' in value ? text((value as Element).props.children) : '';
  }
  return {
    requests, render,
    reopen() { visible = true; render(); },
    close() { (tree.props.onClose as () => void)(); render(); },
    closed: () => !visible, closeCalls: () => closeCalls,
    find(label: string) { const node = nodes(tree).find(item => item.props.title === label || (item.type === 'Pressable' && text(item.props.children) === label)); assert.ok(node, label); return node; },
    press(label: string) { const node = this.find(label); (node.props.onPress as () => void)(); },
    labels: () => text(tree),
    elements: () => nodes(tree),
  };
}

test('cerrar y reabrir conserva la foto y el mismo escaneo; el resultado oculto no se aplica', async () => {
  const app = harness(); app.render();
  app.press('Elegir imagen'); await tick(); app.render();
  assert.equal(app.requests.length, 1);
  const id = app.requests[0].input.scanId;
  app.close();
  app.requests[0].result.resolve({ scan: response(id) });
  await tick();
  app.reopen();
  assert.doesNotMatch(app.labels(), /Revisar productos/);
  app.press('Reintentar esta foto'); await tick(); app.render();
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[1].input.scanId, id);
  app.requests[1].result.resolve({ scan: response(id) });
  await tick(); app.render();
  assert.match(app.labels(), /Revisar productos/);
});

test('añadir dos veces comparte una acción y el éxito limpia la foto para la siguiente lista', async () => {
  const save = deferred<void>(); let calls = 0;
  const app = harness(() => { calls += 1; return save.promise; }); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0]; scan.result.resolve({ scan: response(scan.input.scanId) });
  await tick(); app.render();
  const button = app.find('Añadir 1 producto').props.onPress as () => void;
  button(); button();
  assert.equal(calls, 1);
  app.close();
  assert.equal(app.closed(), false, 'No se cierra mientras se confirma una incorporación en curso');
  save.resolve(); await tick();
  assert.equal(app.closed(), true);
  assert.equal(app.closeCalls(), 1);
  app.reopen();
  assert.doesNotMatch(app.labels(), /Revisar productos/);
  app.find('Elegir imagen');
});

test('un error al incorporar conserva la revisión y reintenta sin solicitar otro OCR', async () => {
  let calls = 0;
  const app = harness(async () => { calls += 1; if (calls === 1) throw new Error('Sin conexión'); }); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0]; scan.result.resolve({ scan: response(scan.input.scanId) });
  await tick(); app.render();
  app.press('Añadir 1 producto'); await tick(); app.render();
  assert.match(app.labels(), /Sin conexión/);
  assert.equal(app.closed(), false);
  app.press('Añadir 1 producto'); await tick();
  assert.equal(calls, 2);
  assert.equal(app.requests.length, 1);
  assert.equal(app.closed(), true);
});

test('un escaneo pendiente permite recuperar el resultado con el mismo identificador', async () => {
  const app = harness(); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0];
  scan.result.reject(new Error('La lectura sigue en proceso. Reintenta esta foto en unos segundos.'));
  await tick(); app.render();
  assert.match(app.labels(), /sigue en proceso/);
  app.press('Reintentar esta foto'); await tick();
  assert.equal(app.requests[1].input.scanId, scan.input.scanId);
  app.requests[1].result.resolve({ scan: response(scan.input.scanId) });
  await tick(); app.render();
  assert.match(app.labels(), /Revisar productos/);
});

test('los errores al confirmar aparecen junto al botón de añadir, después de la revisión', async () => {
  let calls = 0;
  const app = harness(() => { calls += 1; }); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0], result = response(scan.input.scanId);
  result.lines[0].quantity = null;
  scan.result.resolve({ scan: result });
  await tick(); app.render();
  app.press('Añadir 1 producto'); app.render();
  const elements = app.elements();
  const alerts = elements.filter(item => item.props.accessibilityRole === 'alert');
  assert.equal(alerts.length, 1);
  const errorIndex = elements.indexOf(alerts[0]);
  const lastFieldIndex = elements.findLastIndex(item => item.type === 'TextInput');
  const buttonIndex = elements.findIndex(item => item.props.title === 'Añadir 1 producto');
  assert.ok(errorIndex > lastFieldIndex && errorIndex < buttonIndex);
  assert.equal(calls, 0);
  assert.match(app.labels(), /Producto 1: Indica una cantidad/);
});
