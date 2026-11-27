import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { buildDeliveryNoteHtml } from '../../apps/mobile/src/lib/deliveryDocument';
import { canShowSalePaymentSummary } from '../../apps/mobile/src/lib/salePaymentSummary';
import { documentFileName } from '../../apps/mobile/src/lib/documentFileName';
import { sampleBusiness, sampleFonts, sampleImages, sampleSale } from './documentFixtures';

type Element = { type: unknown; props: Record<string, any> };
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children), ...nodes(node.props.footer), ...nodes(node.props.headerAction)];
}

function preview(novaled: boolean, kind: 'sale' | 'delivery', params: Record<string, unknown> = {}, salePatch: Record<string, unknown> = {}) {
  const hooks: unknown[] = [];
  let cursor = 0, tree: Element;
  const downloads: { kind: string; options: any }[] = [];
  const builds: Parameters<typeof buildDeliveryNoteHtml>[0][] = [];
  const routes: string[] = [];
  let fetched = 0;
  const sale = { ...sampleSale, number: 42, total: 650, initialPayment: 100, totalPagado: 200,
    metodoPago: 'por_pagar', estadoPago: 'por_cobrar', estado: 'activa',
    deliverySnapshot: { id: 7, number: 7, clientName: 'UMSA' }, ...salePatch };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const modules: Record<string, unknown> = {
    react: {
      useCallback: (fn: unknown) => fn,
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
        return [hooks[index], (next: unknown) => { hooks[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(hooks[index]) : next; }];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value: unknown) => value } },
    '@expo/vector-icons/Ionicons': 'Icon',
    'expo-router': { router: { back: () => routes.push('back'), replace: (url: string) => routes.push(url) }, useLocalSearchParams: () => params },
    '../components/FormModal': { FormModal: 'FormModal' },
    '../components/PrimaryButton': { PrimaryButton: 'PrimaryButton' },
    '../components/DeliverySignatureOptions': { DeliverySignatureOptions: 'DeliverySignatureOptions' },
    '../components/PdfPaymentOption': { PdfPaymentOption: 'PdfPaymentOption' },
    '../components/DocumentPreviewScreen': { DocumentPreviewScreen: 'Preview' },
    '../theme/ThemeContext': { useTheme: () => ({ colors: { text: '#111111', muted: '#888888', error: '#ff0000' } }) },
    '../lib/api': { api: {
      saleDetail: async () => { fetched++; return { sale }; }, business: async () => ({ business: sampleBusiness }),
    }, mediaUrl: (value: unknown) => value },
    '../lib/documentFileName': { documentFileName },
    '../lib/documentBusiness': { documentBusiness: (value: unknown) => value },
    '../lib/docAssets': { loadDocFonts: async () => sampleFonts, loadDocImages: async () => ({ ...sampleImages, warnings: [] }) },
    '../lib/deliveryDocument': { buildDeliveryNoteHtml: (input: Parameters<typeof buildDeliveryNoteHtml>[0]) => { builds.push(input); return buildDeliveryNoteHtml(input); } },
    '../lib/salePaymentSummary': { canShowSalePaymentSummary },
    '../lib/backend': { IS_NOVALED: novaled },
    '../offline/bridge': { getOfflineGateway: () => null },
    '../lib/pdfFile': { downloadNovaledPdf: async (kind: string, _id: number, _name: string, _token: string, options: unknown) => {
      downloads.push({ kind, options: plain(options) }); return { uri: 'file:///server.pdf', base64: 'pdf', fileName: 'server.pdf' };
    } },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/screens/DeliveryPreviewScreen.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports: any = {};
  runInNewContext(outputText, { exports, require(key: string) { assert.ok(key in modules, key); return modules[key]; } });
  function render() { cursor = 0; tree = exports.DeliveryPreviewScreen({ saleId: 42, documentType: kind }); }
  function control(type: string) {
    const node = nodes(tree).find(node => node.type === type); assert.ok(node, `${type} was not rendered`); return node.props;
  }
  render();
  return {
    render, routes, downloads, builds, fetched: () => fetched,
    hasPreview: () => nodes(tree).some(node => node.type === 'Preview'),
    modal: () => control('FormModal'), signature: () => control('DeliverySignatureOptions'), payment: () => control('PdfPaymentOption'),
    apply() { control('PrimaryButton').onPress(); render(); },
    close() { control('FormModal').onClose(); render(); },
    open() {
      const node = nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel?.includes('firma'))
        ?? nodes(control('Preview').headerAction).find(node => node.type === 'Pressable');
      assert.ok(node, 'Print options action was not rendered'); node.props.onPress(); render();
    },
    async load() { const result = await control('Preview').loadDocument('test-session'); render(); return result; },
    back() { control('Preview').onBack(); },
  };
}

for (const novaled of [false, true]) {
  const label = novaled ? 'Novaled' : 'Lumis';
  test(`${label}: abrir directamente una entrega pide la firma antes de generar el PDF`, async () => {
    const app = preview(novaled, 'delivery');
    assert.equal(app.hasPreview(), false); assert.equal(app.modal().visible, true); assert.equal(app.fetched(), 0);
    assert.equal(app.signature().value.mode, 'asesor');
    app.apply(); assert.equal(app.hasPreview(), true); assert.equal(app.modal().visible, false);
    await app.load();
    if (novaled) assert.deepEqual(app.downloads, [{ kind: 'delivery', options: { mode: 'asesor', name: '' } }]);
    else assert.deepEqual(plain(app.builds[0].deliverySignature), { mode: 'asesor', name: '' });
  });
  test(`${label}: cancelar la elección inicial vuelve sin generar ningún documento`, () => {
    const app = preview(novaled, 'delivery'); app.close();
    assert.deepEqual(app.routes, ['back']); assert.equal(app.fetched(), 0); assert.deepEqual(app.downloads, []);
  });
  test(`${label}: otro nombre se valida, recorta y se usa en la entrega sin alterar al asesor`, async () => {
    const app = preview(novaled, 'delivery');
    app.signature().onChange({ mode: 'otro', name: '   ' }); app.render(); app.apply();
    assert.equal(app.hasPreview(), false); assert.equal(app.modal().visible, true);
    app.signature().onChange({ mode: 'otro', name: '  Ana Pérez & socios  ' }); app.render(); app.apply();
    const result = await app.load();
    if (novaled) assert.deepEqual(app.downloads[0].options, { mode: 'otro', name: 'Ana Pérez & socios' });
    else {
      assert.deepEqual(plain(app.builds[0].deliverySignature), { mode: 'otro', name: 'Ana Pérez & socios' });
      assert.equal(app.builds[0].sale.sellerName, sampleSale.sellerName);
      assert.ok(result.html.includes('Ana Pérez &amp; socios'));
    }
  });
  test(`${label}: cambiar a sin nombre deja vacía la firma y cancelar conserva la opción aplicada`, async () => {
    const app = preview(novaled, 'delivery', { signature: 'otro', name: 'María' });
    assert.equal(app.hasPreview(), true); assert.equal(app.modal().visible, false);
    app.open(); app.signature().onChange({ mode: 'sin_nombre', name: '' }); app.render(); app.close();
    await app.load();
    const before = novaled ? app.downloads.at(-1)!.options : app.builds.at(-1)!.deliverySignature;
    assert.deepEqual(plain(before), { mode: 'otro', name: 'María' });
    app.open(); assert.equal(app.signature().value.mode, 'otro');
    app.signature().onChange({ mode: 'sin_nombre', name: '' }); app.render(); app.apply(); await app.load();
    const after = novaled ? app.downloads.at(-1)!.options : app.builds.at(-1)!.deliverySignature;
    assert.deepEqual(plain(after), { mode: 'sin_nombre', name: '' });
  });
  test(`${label}: los abonos están ocultos por defecto y se activan solo para el PDF solicitado`, async () => {
    const app = preview(novaled, 'sale'); await app.load();
    const before = novaled ? app.downloads.at(-1)!.options : app.builds.at(-1)!;
    assert.equal(before.showPaymentSummary, false);
    app.open(); assert.equal(app.payment().checked, false);
    app.payment().onChange(true); app.render(); app.apply(); const result = await app.load();
    const after = novaled ? app.downloads.at(-1)!.options : app.builds.at(-1)!;
    assert.equal(after.showPaymentSummary, true);
    if (!novaled) assert.match(result.html, /ABONO PARCIAL/);
    const reopened = preview(novaled, 'sale'); await reopened.load();
    assert.equal((novaled ? reopened.downloads[0].options : reopened.builds[0]).showPaymentSummary, false);
  });
  test(`${label}: el valor de impresión enviado por detalle llega al PDF de venta`, async () => {
    const app = preview(novaled, 'sale', { mostrar_pagos: '1', created: '1' }); const result = await app.load();
    assert.equal((novaled ? app.downloads[0].options : app.builds[0]).showPaymentSummary, true);
    if (!novaled) assert.match(result.html, /ABONO PARCIAL/);
    app.back(); assert.deepEqual(app.routes, ['/pos/42']);
  });
  test(`${label}: cancelar las opciones de venta no activa los abonos en el documento`, async () => {
    const app = preview(novaled, 'sale'); await app.load(); app.open();
    app.payment().onChange(true); app.render(); app.close(); await app.load();
    assert.equal((novaled ? app.downloads.at(-1)!.options : app.builds.at(-1)!).showPaymentSummary, false);
    app.open(); assert.equal(app.payment().checked, false);
  });
  for (const params of [{ signature: 'invalida' }, { signature: 'otro', name: ' ' }]) {
    test(`${label}: una firma inválida o vacía en la ruta exige confirmar antes de imprimir (${params.signature})`, () => {
      const app = preview(novaled, 'delivery', params);
      assert.equal(app.hasPreview(), false); assert.equal(app.modal().visible, true); assert.equal(app.fetched(), 0);
    });
  }
}
