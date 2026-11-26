import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { DraftItem } from '../../apps/mobile/src/context/DraftContext';
import * as editing from '../../apps/mobile/src/lib/quoteDraftEditing';

type Element = { type: unknown; props: Record<string, any> };
type Effect = { deps?: unknown[]; cleanup?: () => void };
type Body = { clientId: number | null; branchId: number | null; items: Record<string, unknown>[]; solicitud_id?: string };
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const product = (patch: Partial<DraftItem> = {}): DraftItem => ({
  key: 'existing', productId: 42, name: 'Nombre del catálogo', quantity: 1, unit: 'Unidad', unitPrice: 65,
  marca: 'Marca original', procedencia: 'Bolivia', ...patch,
});

// Execute the actual screen with separate native events and explicit React commits.
// Holding a handler across edits deliberately exercises Guardar before blur/commit.
function harness(initial: DraftItem[], pending: { body: Body; fingerprint: string } | null = null) {
  const hooks: unknown[] = [];
  let cursor = 0, effects: (() => void)[] = [];
  let items = initial.map(item => ({ ...item })), clearCalls = 0;
  let client: { id: number; name: string; phone: null; email: null } | null = null;
  const requests: { body: Body; token: string; result: ReturnType<typeof deferred<{ quote: { id: number } }>> }[] = [];
  const messages: { title: string; message: string; actions?: { text: string; onPress?: () => void }[]; options?: { onDismiss?: () => void } }[] = [];
  const routes: string[] = [];
  const changes: { key: string; patch: Partial<DraftItem> }[] = [];
  const removals: string[] = [];
  const draft = {
    setClient(value: typeof client) { client = value; },
    addItem(value: Omit<DraftItem, 'key'>) { items = [...items, { ...value, key: 'restored-' + items.length }]; },
    updateItem(key: string, patch: Partial<DraftItem>) {
      changes.push({ key, patch });
      items = items.map(item => item.key === key ? { ...item, ...patch } : item);
    },
    removeItem(key: string) { removals.push(key); items = items.filter(item => item.key !== key); },
    clear() { clearCalls += 1; items = []; client = null; },
  };
  const react = {
    useState(initialValue: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initialValue;
      return [hooks[index], (value: unknown) => {
        hooks[index] = typeof value === 'function' ? (value as (current: unknown) => unknown)(hooks[index]) : value;
      }];
    },
    useRef(initialValue: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initialValue }; return hooks[index]; },
    useCallback(callback: unknown, deps: unknown[]) {
      const index = cursor++, previous = hooks[index] as { value: unknown; deps: unknown[] } | undefined;
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) hooks[index] = { value: callback, deps };
      return (hooks[index] as { value: unknown }).value;
    },
    useEffect: effect, useLayoutEffect: effect,
  };
  function effect(callback: () => void | (() => void), deps?: unknown[]) {
    const index = cursor++, previous = hooks[index] as Effect | undefined;
    if (!previous || !deps || deps.some((value, i) => value !== previous.deps?.[i])) effects.push(() => {
      previous?.cleanup?.(); hooks[index] = { deps, cleanup: callback() };
    });
  }
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const alert = (title: string, message = '', actions?: { text: string; onPress?: () => void }[], options?: { onDismiss?: () => void }) => {
    messages.push({ title, message, actions, options }); return messages.length;
  };
  class ApiError extends Error {}
  const modules: Record<string, unknown> = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      ...Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'View'].map(name => [name, name])),
      Keyboard: { dismiss() {}, metrics: () => undefined, addListener: () => ({ remove() {} }) },
      Platform: { OS: 'android' }, StyleSheet: { create: (value: unknown) => value },
    },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    'expo-router': { router: { back() {}, push(route: string) { routes.push(route); }, replace(route: string) { routes.push(route); } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../tutorials/TutorialElements': {
      TutorialTarget: 'TutorialTarget', TutorialScrollView: 'TutorialScrollView', TutorialHelpButton: 'TutorialHelpButton',
      useTutorialAvailability() {}, withTutorial: (component: unknown) => component,
    },
    '../tutorials/TutorialContext': { useTutorial: () => ({ notify() {} }) },
    '../components/FormModal': { FormModal: 'FormModal' },
    '../components/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
    '../components/MagicQuoteScanModal': { MagicQuoteScanModal: 'MagicQuoteScanModal' },
    '../components/QuoteDraftItemCard': { QuoteDraftItemCard: 'QuoteDraftItemCard' },
    '../lib/feedback': { feedback: { alert, warning: alert } },
    '../lib/quoteDraftEditing': editing,
    '../lib/units': { DEFAULT_UNITS: ['Unidad', 'Metros'], loadUnits: async () => ['Unidad', 'Metros'] },
    '../hooks/useLegacyPending': { useLegacyPending: () => pending },
    '../context/AuthContext': { useAuth: () => ({ user: { id: 7, name: 'Ana', username: 'ana' }, token: 'quote-test-session' }) },
    '../context/DraftContext': { useDraft: () => ({ ...draft, items, client }) },
    '../context/LicenseContext': { useLicense: () => ({ refresh: async () => {} }) },
    '../context/MotionContext': { useReducedMotion: () => true },
    '../context/BusinessContext': { useMoney: () => (value: number) => 'Bs. ' + value },
    '../theme/ThemeContext': { useTheme: () => ({ colors: { text: '#111111', muted: '#666666', primary: '#5842f4', border: '#cccccc', background: '#ffffff', surface: '#ffffff', onPrimary: '#ffffff' } }) },
    '../lib/api': { ApiError, api: {
      nextQuoteNumber: async () => ({ nextNumber: 1 }), branches: async () => ({ branches: [] }),
      clients: async () => ({ clients: [] }),
      createQuote(body: Body, token: string) {
        const result = deferred<{ quote: { id: number } }>(); requests.push({ body, token, result }); return result.promise;
      },
    } },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/screens/NewQuoteScreen.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {} as { NewQuoteScreen: () => Element };
  runInNewContext(outputText, { Error, exports, requestAnimationFrame: (callback: () => void) => callback(),
    require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  let tree: Element;
  function nodes(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object' || !('props' in value)) return [];
    const node = value as Element; return [node, ...nodes(node.props.children)];
  }
  function text(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(text).join('');
    return value && typeof value === 'object' && 'props' in value ? text((value as Element).props.children) : '';
  }
  return {
    requests, messages, routes, changes, removals,
    render() { cursor = 0; effects = []; tree = exports.NewQuoteScreen(); effects.forEach(run => run()); return tree; },
    card(index = 0) { const node = nodes(tree).filter(item => item.type === 'QuoteDraftItemCard')[index]; assert.ok(node); return node.props; },
    saveHandler() { const node = nodes(tree).find(item => item.type === 'Pressable' && text(item.props.children) === 'Guardar'); assert.ok(node); return node.props.onPress as () => Promise<void>; },
    snapshot: () => ({ items: items.map(item => ({ ...item })), clearCalls }),
  };
}

test('Guardar toma el último texto enfocado sin esperar blur ni otro render y conserva los vínculos de catálogo', async () => {
  const app = harness([product(), product({ key: 'scan-new', productId: null, name: 'Nuevo del escaneo', createProduct: true })]);
  app.render();
  const save = app.saveHandler();
  app.card().onChange({ name: '  Nombre solo para esta cotización  ', quantityText: '2,5', unitPriceText: '30,50', unit: 'Metros', marca: '  Marca editada  ', procedencia: '' });
  app.card(1).onChange({ name: 'Nuevo revisado', quantityText: '3', unitPriceText: '12,25' });
  const sending = save();
  assert.equal(app.requests.length, 1);
  assert.deepEqual(plain(app.requests[0].body.items), [
    { productId: 42, description: 'Nombre solo para esta cotización', quantity: 2.5, unit: 'Metros', unitPrice: 30.5, marca: 'Marca editada', procedencia: null },
    { productId: null, description: 'Nuevo revisado', quantity: 3, unit: 'Unidad', unitPrice: 12.25, marca: 'Marca original', procedencia: 'Bolivia', createProduct: true },
  ]);
  assert.equal(app.requests[0].token, 'quote-test-session');
  app.requests[0].result.resolve({ quote: { id: 17 } }); await sending;
  assert.deepEqual(app.routes, ['/quotes/17/preview?created=1']);
  assert.equal(app.snapshot().clearCalls, 1);
});

test('una cantidad o precio vacío conserva el texto, evita guardar y permite volver al campo señalado', async () => {
  for (const [raw, field] of [['quantityText', 'quantity'], ['unitPriceText', 'unitPrice']] as const) {
    const app = harness([product()]); app.render();
    app.card().onChange({ [raw]: '' });
    await app.saveHandler()();
    assert.equal(app.requests.length, 0);
    app.render();
    assert.equal(app.card().item[raw], '');
    assert.equal(app.card().showErrors, true);
    assert.equal(app.messages.length, 1);
    assert.match(app.messages[0].message, /Artículo 1:/);
    if (field === 'quantity') app.messages[0].actions?.[0].onPress?.();
    else app.messages[0].options?.onDismiss?.();
    app.render();
    assert.equal(app.card().focusRequest.field, field);
    assert.equal(app.card().expanded, true);
    assert.ok(app.card().focusRequest.requestId > 0);
    assert.equal(app.snapshot().clearCalls, 0);
  }
});

test('Guardar y ver PDF admite un artículo del escaneo sin nombre, cantidad ni unidad y envía precio cero', async () => {
  const app = harness([product({ fromScan: true, productId: null, createProduct: true, name: '', quantityText: '', unit: '', unitPriceText: '' })]);
  app.render();
  const sending = app.saveHandler()();
  assert.equal(app.requests.length, 1);
  assert.deepEqual(plain(app.requests[0].body.items), [{ fromScan: true, productId: null, description: '', quantity: 0,
    unit: '', unitPrice: 0, marca: 'Marca original', procedencia: 'Bolivia', createProduct: false }]);
  assert.equal(app.messages.length, 0);
  app.requests[0].result.resolve({ quote: { id: 25 } });
  await sending;
  assert.deepEqual(app.routes, ['/quotes/25/preview?created=1']);
});

test('dos toques en Guardar comparten el envío y los eventos pendientes no editan ni eliminan líneas mientras se guarda', async () => {
  const app = harness([product()]); app.render();
  const card = app.card(), save = app.saveHandler();
  const first = save(), second = save();
  card.onChange({ name: 'No debe entrar', quantityText: '99' }); card.onRemove(); card.onChooseUnit();
  assert.equal(app.requests.length, 1);
  assert.equal(app.changes.length, 0);
  assert.equal(app.removals.length, 0);
  assert.equal(app.snapshot().items[0].name, 'Nombre del catálogo');
  assert.equal(app.requests[0].body.items[0].description, 'Nombre del catálogo');
  app.render(); assert.equal(app.card().disabled, true);
  app.requests[0].result.resolve({ quote: { id: 18 } }); await Promise.all([first, second]);
  assert.equal(app.snapshot().clearCalls, 1);
});

test('recuperar un envío pendiente conserva exactamente sus datos y bloquea mezclar nuevas ediciones', async () => {
  const body: Body = { clientId: null, branchId: 9, solicitud_id: 'pending-quote-123', items: [
    { productId: 42, description: 'Nombre confirmado antes del corte', quantity: 2.5, unit: 'Metros', unitPrice: 30.5, marca: null, procedencia: null },
  ] };
  const app = harness([product({ name: 'Borrador diferente', unitPriceText: '999' })], { body, fingerprint: 'pending' });
  app.render(); await tick(); app.render();
  assert.equal(app.card().disabled, true);
  app.card().onChange({ name: 'Cambio no permitido', unitPriceText: '1' }); app.card().onRemove();
  assert.equal(app.changes.length, 0); assert.equal(app.removals.length, 0);
  const sending = app.saveHandler()();
  assert.equal(app.requests.length, 1);
  assert.deepEqual(plain(app.requests[0].body), { clientId: null, branchId: 9, items: body.items });
  app.requests[0].result.resolve({ quote: { id: 19 } }); await sending;
  assert.deepEqual(app.routes, ['/quotes/19/preview?created=1']);
});
