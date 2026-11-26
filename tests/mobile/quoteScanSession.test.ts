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
function harness(add: (items: scanReview.ScannedQuoteItem[]) => Promise<void> | void = () => {}, options: {
  maxItems?: number; reducedMotion?: boolean; pick?: () => Promise<{ uri: string; base64: string; ext: string } | null>;
} = {}) {
  const hooks: unknown[] = [];
  let cursor = 0, effects: (() => void)[] = [];
  let visible = true, closeCalls = 0;
  let photoNumber = 0;
  const confirmations: { text: string; onPress?: () => void; style?: string }[][] = [];
  const scrollCalls: { to: string; animated: boolean }[] = [];
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
    useCallback: (callback: unknown) => callback,
  };
  function effect(callback: () => void | (() => void), deps?: unknown[]) {
    const index = cursor++, previous = hooks[index] as Effect | undefined;
    if (!previous || !deps || deps.some((value, i) => value !== previous.deps?.[i])) effects.push(() => {
      previous?.cleanup?.();
      hooks[index] = { deps, cleanup: callback() };
    });
  }
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const pick = options.pick ?? (async () => { photoNumber += 1; return { uri: `file:///private/photo-${photoNumber}.png`, base64: `image-bytes-${photoNumber}`, ext: 'png' }; });
  const modules: Record<string, unknown> = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'Image', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name])),
      Keyboard: { dismiss() {} },
      StyleSheet: { create: (value: unknown) => value } },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    '../lib/api': { api: { scanQuote(input: { scanId: string; base64: string }) {
      const result = deferred<{ scan: QuoteScan }>(); requests.push({ input, result }); return result.promise;
    } } },
    '../lib/media': { pickImageFromCamera: pick, pickImageFromLibrary: pick },
    '../lib/quoteScan': scanReview,
    '../lib/feedback': { feedback: { warning(_title: string, _message: string, actions: typeof confirmations[number]) { confirmations.push(actions); } } },
    '../context/BusinessContext': { useMoney: () => (value: number) => 'Bs. ' + value },
    '../context/MotionContext': { useReducedMotion: () => !!options.reducedMotion },
    '../theme/ThemeContext': { useTheme: () => ({ colors: { text: '#111111', muted: '#666666', primary: '#5842f4', border: '#cccccc', background: '#ffffff', error: '#cc0000' }, dark: false }) },
    './FormModal': { FormModal: 'FormModal' }, './PrimaryButton': { PrimaryButton: 'PrimaryButton' },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/components/MagicQuoteScanModal.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {} as { MagicQuoteScanModal: (props: Record<string, unknown>) => Element };
  runInNewContext(outputText, { Error, exports, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  let tree: Element;
  const render = () => {
    cursor = 0; effects = [];
    const session = exports.MagicQuoteScanModal({ visible, token: 'session-user-one', maxItems: options.maxItems, onClose: () => { visible = false; closeCalls += 1; }, onAdd: add });
    tree = (session.type as (props: Record<string, unknown>) => Element)(session.props);
    (tree.props.scrollRef as { current: unknown }).current = {
      scrollTo: (options: { animated: boolean }) => scrollCalls.push({ to: 'start', animated: options.animated }),
      scrollToEnd: (options: { animated: boolean }) => scrollCalls.push({ to: 'end', animated: options.animated }),
    };
    effects.forEach(run => run());
    return tree;
  };
  function nodes(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object' || !('props' in value)) return [];
    const item = value as Element;
    return [item, ...nodes(item.props.children), ...nodes(item.props.footer)];
  }
  function text(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(text).join('');
    return value && typeof value === 'object' && 'props' in value ? text([(value as Element).props.children, (value as Element).props.footer]) : '';
  }
  return {
    requests, render,
    reopen() { visible = true; render(); },
    close() { (tree.props.onClose as () => void)(); render(); },
    closed: () => !visible, closeCalls: () => closeCalls,
    find(label: string) { const node = nodes(tree).find(item => item.props.accessibilityLabel === label || item.props.title === label || (item.type === 'Pressable' && text(item.props.children) === label)); assert.ok(node, label); return node; },
    press(label: string) { const node = this.find(label); (node.props.onPress as () => void)(); },
    labels: () => text(tree),
    elements: () => nodes(tree),
    contentElements: () => nodes(tree.props.children),
    footerElements: () => nodes(tree.props.footer), scrollCalls,
    confirmRemoval() { confirmations.at(-1)?.find(action => action.style === 'destructive')?.onPress?.(); },
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
  app.press('Reintentar esta hoja'); await tick(); app.render();
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
  app.press('Reintentar esta hoja'); await tick();
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
  result.lines[0].quantity = -1;
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
  assert.match(app.labels(), /Hoja 1, producto 1: Indica una cantidad/);
});

test('añadir permanece en el pie fijo y los controles llevan al inicio o al final de 100 productos', async () => {
  const app = harness(() => {}, { reducedMotion: true }); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0], result = response(scan.input.scanId);
  result.lines = Array.from({ length: 100 }, (_, index) => ({ ...result.lines[0], name: `Artículo ${index + 1}` }));
  scan.result.resolve({ scan: result }); await tick(); app.render();
  assert.ok(app.footerElements().some(node => node.props.title === 'Añadir 100 productos'));
  assert.ok(!app.contentElements().some(node => node.props.title === 'Añadir 100 productos'));
  app.press('Ir al final de la revisión');
  app.press('Ir al inicio de la revisión');
  assert.deepEqual(app.scrollCalls, [{ to: 'end', animated: false }, { to: 'start', animated: false }]);
});

test('se incorporan datos incompletos sin inventar cantidad y con precio cero', async () => {
  let saved: scanReview.ScannedQuoteItem[] = [];
  const app = harness(items => { saved = items; }); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0], result = response(scan.input.scanId);
  result.lines[0] = { ...result.lines[0], quantity: null, unitPrice: null, unit: null };
  scan.result.resolve({ scan: result }); await tick(); app.render();
  assert.equal(app.find('Añadir 1 producto').props.disabled, false);
  app.press('Añadir 1 producto'); await tick();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].quantityText, '');
  assert.equal(saved[0].unitPrice, 0);
  assert.equal(saved[0].fromScan, true);
  assert.equal(app.find('Precio del producto 1').props.value, '0');
  assert.equal(saved[0].unit, '');
  assert.equal(app.closed(), true);
});

test('cuatro hojas de 50 productos conservan las ediciones y se incorporan juntas en orden', async () => {
  let saved: scanReview.ScannedQuoteItem[] = [];
  const app = harness(items => { saved = items; }); app.render();
  for (let page = 1; page <= 4; page += 1) {
    if (page > 1) { app.press('Añadir hoja'); app.render(); }
    app.press('Elegir imagen'); await tick(); app.render();
    const scan = app.requests[page - 1];
    const result = response(scan.input.scanId);
    result.lines = Array.from({ length: 50 }, (_, index) => ({ ...result.lines[0], name: `Hoja ${page} artículo ${index + 1}` }));
    scan.result.resolve({ scan: result }); await tick(); app.render();
    if (page === 1) {
      const input = app.find('Nombre del producto 1');
      (input.props.onChangeText as (value: string) => void)('Nombre corregido'); app.render();
    }
  }
  assert.equal(app.requests.length, 4);
  assert.equal(new Set(app.requests.map(scan => scan.input.scanId)).size, 4);
  assert.match(app.labels(), /Revisar productos \(200\/200\)/);
  assert.equal(app.elements().filter(item => item.type === 'TextInput').length, 200, 'Solo se montan los campos de la hoja activa, no las cuatro');
  app.press('Revisar hoja 1'); app.render();
  assert.equal(app.find('Nombre del producto 1').props.value, 'Nombre corregido');
  app.press('Añadir 200 productos'); await tick();
  assert.equal(saved.length, 200);
  assert.equal(saved[0].name, 'Nombre corregido');
  assert.equal(saved[50].name, 'Hoja 2 artículo 1');
  assert.equal(saved[199].name, 'Hoja 4 artículo 50');
  assert.equal(app.closed(), true);
});

test('fallar y reintentar la segunda hoja conserva la primera y reutiliza solo el identificador fallido', async () => {
  let saved: scanReview.ScannedQuoteItem[] = [];
  const app = harness(items => { saved = items; }); app.render();
  app.press('Elegir imagen'); await tick();
  const first = app.requests[0]; first.result.resolve({ scan: response(first.input.scanId) }); await tick(); app.render();
  (app.find('Precio del producto 1').props.onChangeText as (value: string) => void)('25'); app.render();
  app.press('Añadir hoja'); app.render(); app.press('Elegir imagen'); await tick();
  const second = app.requests[1]; second.result.reject(new Error('Sin conexión')); await tick(); app.render();
  assert.equal(app.find('Añadir 1 producto').props.disabled, true);
  app.press('Añadir 1 producto'); await tick(); app.render();
  assert.equal(saved.length, 0, 'Una confirmación retenida no incorpora solo las hojas completadas');
  app.press('Reintentar esta hoja'); await tick();
  assert.equal(app.requests[2].input.scanId, second.input.scanId);
  app.requests[2].result.resolve({ scan: response(second.input.scanId) }); await tick(); app.render();
  app.press('Añadir 2 productos'); await tick();
  assert.equal(saved[0].unitPrice, 25);
  assert.equal(saved.length, 2);
  assert.equal(app.requests.length, 3);
});

test('quitar una hoja exige confirmación y conserva los productos y claves de las restantes', async () => {
  let saved: scanReview.ScannedQuoteItem[] = [];
  const app = harness(items => { saved = items; }); app.render();
  for (let page = 1; page <= 2; page += 1) {
    if (page > 1) { app.press('Añadir hoja'); app.render(); }
    app.press('Elegir imagen'); await tick();
    const scan = app.requests[page - 1], result = response(scan.input.scanId);
    result.lines[0].name = `Hoja ${page}`;
    scan.result.resolve({ scan: result }); await tick(); app.render();
  }
  app.press('Quitar hoja 1'); app.render();
  assert.match(app.labels(), /Revisar productos \(2\/2\)/);
  app.confirmRemoval(); app.render();
  app.press('Añadir 1 producto'); await tick();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Hoja 2');
});

test('el límite disponible de la cotización se comprueba antes de incorporar y permite desmarcar filas', async () => {
  let saved: scanReview.ScannedQuoteItem[] = [];
  const app = harness(items => { saved = items; }, { maxItems: 1 }); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0], result = response(scan.input.scanId);
  result.lines.push({ ...result.lines[0], name: 'Segundo' });
  scan.result.resolve({ scan: result }); await tick(); app.render();
  assert.equal(app.find('Añadir 2 productos').props.disabled, true);
  app.press('Añadir 2 productos'); await tick(); app.render();
  assert.equal(saved.length, 0);
  app.press('Incluir producto 2'); app.render();
  assert.equal(app.find('Añadir 1 producto').props.disabled, false);
  app.press('Añadir 1 producto'); await tick();
  assert.equal(saved.length, 1);
});

test('elegir la misma imagen conserva su edición y no consume otro escaneo', async () => {
  const app = harness(() => {}, { pick: async () => ({ uri: 'same.png', base64: 'same-bytes', ext: 'png' }) }); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0]; scan.result.resolve({ scan: response(scan.input.scanId) }); await tick(); app.render();
  (app.find('Nombre del producto 1').props.onChangeText as (value: string) => void)('Corregido'); app.render();
  app.press('Añadir hoja'); app.render(); app.press('Elegir imagen'); await tick(); app.render();
  assert.equal(app.requests.length, 1);
  assert.equal(app.find('Nombre del producto 1').props.value, 'Corregido');
  assert.match(app.labels(), /imagen ya está añadida/);
});

test('cancelar el selector de una hoja adicional conserva la revisión anterior', async () => {
  let picks = 0;
  const app = harness(() => {}, { pick: async () => ++picks === 1
    ? { uri: 'first.png', base64: 'first-image', ext: 'png' } : null }); app.render();
  app.press('Elegir imagen'); await tick();
  const scan = app.requests[0]; scan.result.resolve({ scan: response(scan.input.scanId) }); await tick(); app.render();
  (app.find('Nombre del producto 1').props.onChangeText as (value: string) => void)('Nombre revisado'); app.render();
  app.press('Añadir hoja'); app.render(); app.press('Elegir imagen'); await tick(); app.render();
  assert.equal(app.requests.length, 1);
  assert.equal(app.find('Nombre del producto 1').props.value, 'Nombre revisado');
  assert.equal(app.find('Añadir 1 producto').props.disabled, false);
});

test('cerrar durante otra hoja mantiene las anteriores y no duplica un resultado tardío', async () => {
  let saved: scanReview.ScannedQuoteItem[] = [];
  const app = harness(items => { saved = items; }); app.render();
  app.press('Elegir imagen'); await tick();
  const first = app.requests[0]; first.result.resolve({ scan: response(first.input.scanId) }); await tick(); app.render();
  (app.find('Precio del producto 1').props.onChangeText as (value: string) => void)('35'); app.render();
  app.press('Añadir hoja'); app.render(); app.press('Elegir imagen'); await tick(); app.render();
  const second = app.requests[1]; app.close();
  second.result.resolve({ scan: response(second.input.scanId) }); await tick(); app.reopen();
  app.press('Reintentar hoja 2'); await tick();
  assert.equal(app.requests[2].input.scanId, second.input.scanId);
  app.requests[2].result.resolve({ scan: response(second.input.scanId) }); await tick(); app.render();
  app.press('Añadir 2 productos'); await tick();
  assert.equal(saved.length, 2);
  assert.equal(saved[0].unitPrice, 35);
});
