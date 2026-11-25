import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { sampleBusiness, sampleQuote, sampleSale, documentItems } from './documentFixtures';
import { getDocumentClient, verifySavedDocumentClient } from '../../apps/mobile/src/lib/documentClient';
import { changedQuoteOptions } from '../../apps/mobile/src/lib/quoteOptions';

type Element = { type: unknown; props: Record<string, any> };
type Screen = 'quote' | 'sale';
type ItemPatch = { documentId: number; itemId: number; body: Record<string, unknown>; token: string };
type Effect = { deps?: unknown[]; cleanup?: () => void };
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

// Native events and React commits are separate so Quote's last keystroke can be
// submitted before blur, while Sale's normal state commit is exercised as well.
function harness(screen: Screen, novaled: boolean, newSale = false) {
  const hooks: unknown[] = [];
  let cursor = 0, effects: (() => void)[] = [], tree: Element;
  let access = { canEdit: true, proLocked: false, access: novaled ? 'allowed' : 'pro' };
  let accessRequests = 0;
  const itemPatches: ItemPatch[] = [];
  const documentPatches: Record<string, unknown>[] = [];
  const messages: { title: string; message: string }[] = [];
  const routes: string[] = [];
  const createdSales: Record<string, any>[] = [];
  const record = plain(screen === 'quote' ? sampleQuote : {
    ...sampleSale, estado: 'activa', estadoPago: 'por_cobrar', metodoPago: 'por_pagar',
    branchId: 1, agentId: 7, clientId: null, payments: [], totalPagado: 0,
    notaPago: null, transferenciaNumero: null, comprobanteUrl: null,
    canEditItems: true, canChangeBranch: true,
  });
  // A legacy row may have no snapshot even though the PDF falls back to catalog
  // metadata. An untouched input must not overwrite that fallback with null.
  record.items = documentItems.map((item, index) => ({
    ...item, marca: index === 0 ? null : 'Marca del segundo',
    procedencia: index === 0 ? null : 'Procedencia del segundo',
  }));
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks[index], (next: unknown) => {
        hooks[index] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(hooks[index]) : next;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
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
  const feedback = {
    alert(title: string, message: string) { messages.push({ title, message }); },
    error(title: string, message: string) { messages.push({ title, message }); },
    warning(title: string, message: string) { messages.push({ title, message }); },
  };
  class ApiError extends Error {}
  const updateItem = async (documentId: number, itemId: number, body: Record<string, unknown>, token: string) => {
    itemPatches.push({ documentId, itemId, body: plain(body), token });
    record.items = record.items.map(item => item.id === itemId ? { ...item, ...body } : item);
    return {};
  };
  const updateDocument = async (_id: number, body: Record<string, unknown>) => {
    documentPatches.push(plain(body)); Object.assign(record, body); return {};
  };
  let draftItems = newSale ? record.items.map(item => ({ ...item, key: `draft-${item.id}`, name: item.description })) : [];
  const draft = { client: null, setClient() {}, addItem() {},
    updateItem(key: string, patch: Record<string, unknown>) { draftItems = draftItems.map(item => item.key === key ? { ...item, ...patch } : item); },
    removeItem(key: string) { draftItems = draftItems.filter(item => item.key !== key); }, clear() { draftItems = []; } };
  const modules: Record<string, unknown> = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      ...Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'TextInput', 'View'].map(name => [name, name])),
      Platform: { OS: 'android' },
      StyleSheet: { create: (value: unknown) => value },
    },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    'expo-router': {
      router: { back() { routes.push('back'); }, push(route: string) { routes.push(route); }, replace(route: string) { routes.push(route); } },
      useLocalSearchParams: () => ({ id: String(record.id) }),
      useFocusEffect: (callback: () => void) => effect(callback, [callback]),
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../tutorials/TutorialElements': {
      TutorialTarget: 'TutorialTarget', TutorialScrollView: 'TutorialScrollView', TutorialHelpButton: 'TutorialHelpButton',
      useTutorialAvailability() {}, withTutorial: (component: unknown) => component,
    },
    '../tutorials/TutorialContext': { useTutorial: () => ({ notify() {} }) },
    '../components/DocumentClientModal': { DocumentClientModal: 'DocumentClientModal' },
    '../lib/documentClient': { getDocumentClient, verifySavedDocumentClient },
    '../components/FormModal': { FormModal: 'FormModal' },
    '../components/DatePickerModal': { DatePickerModal: 'DatePickerModal' },
    '../components/ItemSwipe': { ItemSwipe: 'ItemSwipe' },
    '../components/ReorderItemsModal': { ReorderItemsModal: 'ReorderItemsModal' },
    '../components/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
    '../components/DocumentOptions': { DocumentOptions: 'DocumentOptions' },
    '../components/SegmentedTabs': { SegmentedTabs: 'SegmentedTabs' },
    '../components/SalePaymentSection': { SalePaymentSection: 'SalePaymentSection' },
    '../components/ClientPickerModal': { ClientPickerModal: 'ClientPickerModal' },
    '../components/ProBadge': { ProBadge: 'ProBadge' },
    '../components/QuoteCard': {
      STATUS_COLOR: { borrador: '#555555' }, STATUS_LABEL: { borrador: 'Borrador' },
    },
    '../hooks/useDocumentEditAccess': { useDocumentEditAccess: () => ({
      ...access, requestEdit() { accessRequests += 1; return access.canEdit; },
    }) },
    '../hooks/useLegacyPending': { useLegacyPending: () => null },
    '../hooks/useKeyboardAwareNotes': { useKeyboardAwareNotes: () => ({
      scrollRef: { current: null }, inputRef: { current: null }, onScroll() {}, reveal() {}, inputStyle: { minHeight: 90, maxHeight: 200 },
    }) },
    '../context/AuthContext': { useAuth: () => ({ token: 'document-edit-session', user: { id: 7, name: 'Agente', permissions: { takePayments: true } } }) },
    '../context/DraftContext': { useDraft: () => ({ ...draft, items: draftItems }) },
    '../context/BusinessContext': { useMoney: () => (value: number) => `Bs. ${value}`, useBusiness: () => ({ business: sampleBusiness }) },
    '../theme/ThemeContext': { useTheme: () => ({ colors: { background: '#ffffff', surface: '#ffffff', text: '#111111', primary: '#5842f4', onPrimary: '#ffffff', muted: '#666666', border: '#cccccc', icon: '#666666', error: '#ee3333' } }) },
    '../lib/backend': { IS_NOVALED: novaled },
    '../lib/feedback': { feedback },
    '../lib/format': { formatDate: (date: string) => date },
    '../lib/quoteOptions': { changedQuoteOptions },
    '../lib/media': { pickImageFromCamera: async () => null, pickImageFromLibrary: async () => null },
    '../lib/api': { ApiError, mediaUrl: (url: string | null) => url, api: {
      quoteDetail: async () => ({ quote: plain(record) }), saleDetail: async () => ({ sale: plain(record) }),
      branches: async () => ({ branches: [] }), agents: async () => ({ agents: [] }), nextSaleNumber: async () => ({ nextNumber: 1 }),
      updateQuoteItem: updateItem, updateSaleItem: updateItem,
      updateQuote: updateDocument, updateSale: updateDocument,
      createSale: async (body: Record<string, any>) => { createdSales.push(plain(body)); return { sale: { id: 99, number: 99 } }; },
    } },
  };
  const file = screen === 'quote' ? 'QuoteDetailScreen' : 'SaleEditorScreen';
  const source = readFileSync(new URL(`../../apps/mobile/src/screens/${file}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports: Record<string, (props?: unknown) => Element> = {};
  runInNewContext(outputText, { Error, exports, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  function nodes(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object' || !('props' in value)) return [];
    const node = value as Element;
    return [node, ...nodes(node.props.children)];
  }
  function content(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(content).join('');
    return value && typeof value === 'object' && 'props' in value ? content((value as Element).props.children) : '';
  }
  function find(predicate: (node: Element) => boolean) {
    const node = nodes(tree).find(predicate); assert.ok(node, 'Expected UI control was not rendered'); return node.props;
  }
  function render() {
    cursor = 0; effects = [];
    tree = exports[file](screen === 'sale' ? { saleId: newSale ? undefined : record.id } : undefined);
    effects.forEach(run => run());
  }
  return {
    itemPatches, documentPatches, createdSales, routes, messages, render,
    openClient() {
      const row = nodes(tree).find(node => node.props.accessibilityLabel === 'Editar datos del cliente');
      if (row) row.props.onPress();
      else find(node => node.type === 'PrimaryButton' && node.props.title.includes('Añadir cliente')).onPress();
      render();
    },
    clientModal() { return find(node => node.type === 'DocumentClientModal'); },
    hasClientModal() { return nodes(tree).some(node => node.type === 'DocumentClientModal'); },
    async mount() { render(); await tick(); render(); },
    open(index = 0) {
      if (newSale) find(node => node.type === 'Pressable' && node.props.accessibilityLabel === `Editar artículo ${index + 1}`).onPress();
      else find(node => node.type === 'ItemSwipe' && node.props.children != null && content(node.props.children).includes(record.items[index].description)).onEdit();
      render();
    },
    input(field: 'Marca' | 'Procedencia' | 'Nombre' | 'Cantidad' | 'Precio', index = 0) {
      const label = screen === 'quote' ? `${field} del artículo ${index + 1}` : `${field} del producto`;
      return find(node => node.type === 'TextInput' && node.props.accessibilityLabel === label);
    },
    hasMetadataInput() { return nodes(tree).some(node => node.type === 'TextInput' && String(node.props.accessibilityLabel).startsWith('Marca del')); },
    hasNameInput() { return nodes(tree).some(node => node.type === 'TextInput' && String(node.props.accessibilityLabel).startsWith('Nombre del')); },
    draftItems: () => plain(draftItems),
    commitItem(index = 0) {
      return find(node => node.type === 'Pressable' && node.props.accessibilityLabel === (screen === 'quote' ? `Guardar artículo ${index + 1}` : 'Guardar cambios del producto')).onPress();
    },
    saveHeader() { return find(node => node.type === 'Pressable' && !node.props.accessibilityLabel && content(node.props.children) === 'Guardar').onPress(); },
    selectDocument(tab: 'venta' | 'entrega') { find(node => node.type === 'SegmentedTabs').onChange(tab); render(); },
    previewTitle() { return find(node => node.type === 'PrimaryButton' && (screen === 'quote' ? node.props.title === 'Generar vista previa' : node.props.title.startsWith('Ver PDF de la '))).title; },
    preview() { return find(node => node.type === 'PrimaryButton' && (screen === 'quote' ? node.props.title === 'Generar vista previa' : node.props.title.startsWith('Ver PDF de la '))).onPress(); },
    lock() { access = { canEdit: false, proLocked: true, access: 'free' }; render(); },
    accessRequests: () => accessRequests,
    swipe() { return find(node => node.type === 'ItemSwipe'); },
  };
}

for (const novaled of [false, true]) {
  const variant = novaled ? 'Lumis Novaled' : 'Lumis';
  test(`${variant}: la pestaña activa determina el botón y la ruta del PDF sin registrar una entrega`, async () => {
    const app = harness('sale', novaled); await app.mount();
    assert.equal(app.previewTitle(), 'Ver PDF de la venta');
    app.preview(); await tick(); app.render();
    app.selectDocument('entrega');
    assert.equal(app.previewTitle(), 'Ver PDF de la entrega');
    app.preview(); await tick(); app.render();
    app.selectDocument('venta');
    assert.equal(app.previewTitle(), 'Ver PDF de la venta');
    app.preview(); await tick(); app.render();
    assert.deepEqual(app.routes, [`/pos/${sampleSale.id}/preview`, `/pos/${sampleSale.id}/delivery`, `/pos/${sampleSale.id}/preview`]);
    assert.deepEqual(app.documentPatches, []);
    assert.deepEqual(app.messages, []);
  });
  for (const screen of ['quote', 'sale'] as const) {
    test(`${variant}: ${screen} edita datos del cliente por modal y los conserva al volver a abrir`, async () => {
      const app = harness(screen, novaled); await app.mount(); app.openClient();
      const data = { name: 'Cliente del proyecto', phone: '70000000', email: 'proyecto@example.com', address: 'Av. Norte', nit: '12345' };
      await app.clientModal().onSave(data); app.clientModal().onClose(); app.render();
      assert.deepEqual(app.documentPatches, [{ clientDetails: data }]);
      app.openClient(); assert.deepEqual(plain(app.clientModal().initial), data);
      app.clientModal().onClose(); app.render(); app.preview(); await tick();
      assert.equal(app.routes.length, 1);
      assert.equal(app.documentPatches.length, 1);
    });
    test(`${variant}: ${screen} cancelar el modal no modifica al cliente y el plan restringido no abre edición`, async () => {
      const app = harness(screen, novaled); await app.mount(); app.openClient();
      app.clientModal().onClose(); app.render();
      assert.equal(app.hasClientModal(), false); assert.deepEqual(app.documentPatches, []);
      app.lock(); app.openClient(); assert.equal(app.hasClientModal(), false);
      assert.ok(app.accessRequests() > 0);
    });
  }
  test(`${variant}: nueva venta mantiene la lista compacta y guarda nombre e importes desde el acordeón`, async () => {
    const app = harness('sale', novaled, true); await app.mount();
    assert.equal(app.hasNameInput(), false);
    app.open();
    app.input('Nombre').onChangeText('Nombre revisado');
    app.input('Cantidad').onChangeText('3,5');
    app.input('Precio').onChangeText('12,25');
    app.render(); await app.commitItem(); app.render();
    assert.equal(app.hasNameInput(), false);
    assert.equal(app.createdSales.length, 0);
    const saved = app.draftItems()[0];
    assert.equal(saved.name, 'Nombre revisado');
    assert.equal(saved.quantity, 3.5); assert.equal(saved.unitPrice, 12.25);
    assert.equal(saved.productId, documentItems[0].productId);
    assert.deepEqual(app.messages, []);
  });
  test(`${variant}: guardar nueva venta toma la edición abierta sin exigir Guardar en cada artículo`, async () => {
    const app = harness('sale', novaled, true); await app.mount(); app.open();
    app.input('Nombre').onChangeText('  Última edición  ');
    app.input('Precio').onChangeText('19,75'); app.render();
    await app.saveHeader();
    assert.equal(app.createdSales.length, 1);
    assert.equal(app.createdSales[0].items[0].description, 'Última edición');
    assert.equal(app.createdSales[0].items[0].unitPrice, 19.75);
    assert.equal(app.createdSales[0].items[0].productId, documentItems[0].productId);
    assert.deepEqual(app.itemPatches, []);
    assert.deepEqual(app.routes, ['/pos/99/preview?created=1']);
  });
  test(`${variant}: nueva venta permite cambiar marca y vaciar procedencia desde el mismo acordeón`, async () => {
    const app = harness('sale', novaled, true); await app.mount(); app.open(1);
    app.input('Marca').onChangeText('  Marca de la venta  ');
    app.input('Procedencia').onChangeText('   '); app.render();
    await app.commitItem(); app.render(); app.open(1);
    assert.equal(app.input('Marca').value, 'Marca de la venta');
    assert.equal(app.input('Procedencia').value, '');
    await app.saveHeader();
    const sent = app.createdSales[0].items[1];
    assert.equal(sent.marca, 'Marca de la venta');
    assert.equal(sent.procedencia, null);
    assert.equal(sent.productId, documentItems[1].productId);
    assert.equal(app.createdSales[0].items[0].marca, null);
    assert.deepEqual(app.itemPatches, []);
  });
  test(`${variant}: una cantidad vacía mantiene abierto el artículo y bloquea enviar la venta`, async () => {
    const app = harness('sale', novaled, true); await app.mount(); app.open();
    app.input('Cantidad').onChangeText(''); app.render();
    await app.commitItem(); app.render();
    assert.equal(app.hasNameInput(), true);
    await app.saveHeader();
    assert.equal(app.createdSales.length, 0);
    assert.equal(app.input('Cantidad').value, '');
    assert.ok(app.messages.some(message => /cantidad/.test(message.message)), JSON.stringify(app.messages));
  });
  test(`${variant}: cambiar de artículo conserva el borrador editado sin mezclar los nombres`, async () => {
    const app = harness('sale', novaled, true); await app.mount(); app.open();
    app.input('Nombre').onChangeText('Primero editado'); app.render(); app.open(1);
    assert.equal(app.draftItems()[0].name, 'Primero editado');
    assert.equal(app.input('Nombre').value, documentItems[1].description);
    app.open(1);
    assert.equal(app.hasNameInput(), false);
    assert.deepEqual(app.createdSales, []);
  });
  for (const screen of ['quote', 'sale'] as const) {
    const document = screen === 'quote' ? 'cotización' : 'venta';

    test(`${variant}: ${document} no borra metadata de legado al guardar otros campos`, async () => {
      const app = harness(screen, novaled); await app.mount(); app.open();
      app.input('Nombre').onChangeText('  Descripción revisada  '); app.render();
      await app.commitItem();
      assert.equal(app.itemPatches.length, 1);
      const { body, itemId, token } = app.itemPatches[0];
      assert.equal(itemId, 1); assert.equal(token, 'document-edit-session');
      assert.equal(body.description, 'Descripción revisada');
      assert.equal(Object.hasOwn(body, 'marca'), false);
      assert.equal(Object.hasOwn(body, 'procedencia'), false);
      assert.deepEqual(app.messages, []);
    });

    test(`${variant}: ${document} guarda metadata editada y recortada al generar el PDF`, async () => {
      const app = harness(screen, novaled); await app.mount(); app.open();
      app.input('Marca').onChangeText('  Marca nueva  ');
      app.input('Procedencia').onChangeText('  Perú  ');
      // Quote uses refs so this intentionally submits without another render.
      if (screen === 'sale') app.render();
      await app.preview(); await tick();
      assert.equal(app.itemPatches.length, 1);
      assert.equal(app.itemPatches[0].body.marca, 'Marca nueva');
      assert.equal(app.itemPatches[0].body.procedencia, 'Perú');
      assert.deepEqual(app.routes, [screen === 'quote' ? '/quotes/42/preview' : '/pos/25/preview']);
      assert.deepEqual(app.messages, []);
    });

    test(`${variant}: ${document} editar solo marca conserva la procedencia sin tocar`, async () => {
      const app = harness(screen, novaled); await app.mount(); app.open();
      app.input('Marca').onChangeText('  Nueva marca  ');
      if (screen === 'sale') app.render();
      await app.saveHeader();
      assert.equal(app.itemPatches.length, 1);
      assert.equal(app.itemPatches[0].body.marca, 'Nueva marca');
      assert.equal(Object.hasOwn(app.itemPatches[0].body, 'procedencia'), false);
    });

    test(`${variant}: ${document} envía null explícito si se escribe y vacía un dato inicialmente nulo`, async () => {
      const app = harness(screen, novaled); await app.mount(); app.open();
      const marca = app.input('Marca');
      marca.onChangeText('Temporal'); marca.onChangeText('');
      const procedencia = app.input('Procedencia');
      procedencia.onChangeText('Temporal'); procedencia.onChangeText('   ');
      if (screen === 'sale') app.render();
      await app.saveHeader();
      assert.equal(app.itemPatches.length, 1);
      assert.equal(Object.hasOwn(app.itemPatches[0].body, 'marca'), true);
      assert.equal(Object.hasOwn(app.itemPatches[0].body, 'procedencia'), true);
      assert.equal(app.itemPatches[0].body.marca, null);
      assert.equal(app.itemPatches[0].body.procedencia, null);
    });

    test(`${variant}: ${document} reinicia valores y marcas de edición al cambiar de artículo`, async () => {
      const app = harness(screen, novaled); await app.mount(); app.open();
      app.input('Marca').onChangeText('No debe pasar al segundo');
      app.input('Procedencia').onChangeText('Tampoco debe pasar');
      app.render(); app.open(1);
      assert.equal(app.input('Marca', 1).value, 'Marca del segundo');
      assert.equal(app.input('Procedencia', 1).value, 'Procedencia del segundo');
      app.input('Nombre', 1).onChangeText('Segundo revisado'); app.render();
      await app.commitItem(1);
      assert.equal(app.itemPatches.length, 1);
      assert.equal(app.itemPatches[0].itemId, 2);
      assert.equal(app.itemPatches[0].body.description, 'Segundo revisado');
      assert.equal(Object.hasOwn(app.itemPatches[0].body, 'marca'), false);
      assert.equal(Object.hasOwn(app.itemPatches[0].body, 'procedencia'), false);
    });

    test(`${variant}: ${document} respeta el candado de edición y mantiene disponible consultar PDF`, async () => {
      const app = harness(screen, novaled); await app.mount(); app.lock(); app.open();
      assert.equal(app.swipe().proLocked, true);
      assert.equal(app.hasMetadataInput(), false);
      assert.ok(app.accessRequests() > 0);
      await app.preview(); await tick();
      assert.equal(app.itemPatches.length, 0);
      assert.deepEqual(app.routes, [screen === 'quote' ? '/quotes/42/preview' : '/pos/25/preview']);
    });
  }
}
