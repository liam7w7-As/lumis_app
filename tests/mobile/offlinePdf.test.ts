import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { buildQuoteHtml } from '../../apps/mobile/src/lib/quoteDocument';
import { buildDeliveryNoteHtml } from '../../apps/mobile/src/lib/deliveryDocument';
import { sampleBusiness, sampleFonts, sampleImages, sampleQuote, sampleSale } from './documentFixtures';
import { documentFileName } from '../../apps/mobile/src/lib/documentFileName';

function preview(kind: 'quote' | 'sale' | 'delivery', novaled: boolean, online: boolean, pending: number, id: number, downloadError?: string, salePatch: Record<string, unknown> = {}) {
  const downloads: string[] = [];
  const builtSales: any[] = [];
  const jsx = (type: unknown, props: any) => ({ type, props });
  const download = async () => { downloads.push(kind); if (downloadError) throw Error(downloadError); return { uri: 'file:///server.pdf', base64: 'pdf' }; };
  const modules: Record<string, unknown> = {
    react: { useCallback: (fn: unknown) => fn, useState: (value: unknown) => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View' },
    '@expo/vector-icons/Ionicons': 'Icon', 'expo-router': { router: {}, useLocalSearchParams: () => ({}) },
    '../components/FormModal': { FormModal: 'FormModal' }, '../components/PrimaryButton': { PrimaryButton: 'Button' },
    '../components/DocumentPreviewScreen': { DocumentPreviewScreen: 'Preview' },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {} }) },
    '../lib/api': { api: {
      quoteDetail: async () => ({ quote: { ...sampleQuote, id, number: 'P-LOCAL-1' } }),
      saleDetail: async () => ({ sale: { ...sampleSale, id, number: 'P-LOCAL-1',
        ...(novaled && online && !pending && id < 1e12 ? { deliverySnapshot: { id, number: 'P-LOCAL-1' } } : {}), ...salePatch } }),
      business: async () => ({ business: sampleBusiness }),
    }, mediaUrl: (value: unknown) => value },
    '../lib/documentBusiness': { documentBusiness: (value: unknown) => value },
    '../lib/docAssets': { loadDocFonts: async () => sampleFonts, loadDocImages: async () => ({ ...sampleImages, warnings: [] }) },
    '../lib/quoteDocument': { buildQuoteHtml }, '../lib/deliveryDocument': { buildDeliveryNoteHtml: (input: Parameters<typeof buildDeliveryNoteHtml>[0]) => { builtSales.push(input.sale); return buildDeliveryNoteHtml(input); } },
    '../lib/backend': { IS_NOVALED: novaled },
    '../lib/documentFileName': { documentFileName },
    '../lib/pdfFile': { downloadNovaledPdf: download, downloadNovaledQuotePdf: download },
    '../offline/bridge': { getOfflineGateway: () => ({ status: () => ({ online, pending }) }) },
  };
  const name = kind === 'quote' ? 'QuotePreviewScreen' : 'DeliveryPreviewScreen';
  const source = readFileSync(new URL(`../../apps/mobile/src/screens/${name}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports: any = {};
  runInNewContext(outputText, { exports, require: (key: string) => { assert.ok(key in modules, key); return modules[key]; } });
  const screen = exports[name](kind === 'quote' ? { quoteId: id } : { saleId: id, documentType: kind });
  const props = kind === 'quote' ? screen.props : screen.props.children[0].props;
  return { downloads, builtSales, load: () => props.loadDocument('private-session') };
}

for (const novaled of [false, true]) test(`${novaled ? 'Novaled' : 'Lumis'} entrega offline conserva su número, cliente y líneas emitidas con los pagos de la venta`, async () => {
  const patch = {
    number: 42, total: 650, initialPayment: 100, totalPagado: 200, metodoPago: 'por_pagar', estadoPago: 'por_cobrar', estado: 'activa',
    showNotes: true, notes: 'Observación de la venta', includeSello: true, includeSignature: true,
    deliverySnapshot: {
      id: 99, number: 7, createdAt: '2025-01-02T12:00:00Z', entregadaAt: '2025-01-10T14:00:00Z', deliveryDate: '2025-01-03',
      clientName: 'Cliente histórico de entrega', clientDetails: { name: 'Cliente histórico de entrega', phone: null, email: null, address: null, nit: null },
      branchName: 'Sucursal de la entrega', sellerName: 'Asesor de entrega',
      items: [{ ...sampleSale.items[0], description: 'Artículo de la nota emitida', quantity: 2, subtotal: 40, unitPrice: 20 }],
      total: 40, totalPagado: 40, initialPayment: 40, metodoPago: 'efectivo', estadoPago: 'pagado', estado: 'anulada',
      notes: 'No usar esta nota', showNotes: false, includeSello: false, includeSignature: false,
    },
  };
  const app = preview('delivery', novaled, false, 0, 42, undefined, patch); const result = await app.load();
  assert.ok(result.html.includes('Cliente histórico de entrega'.toUpperCase()) || result.html.includes('Cliente histórico de entrega'));
  assert.ok(result.html.includes('Artículo de la nota emitida')); assert.ok(result.html.includes('Sucursal de la entrega'));
  assert.match(result.html, /<title>NOTA DE ENTREGA #7<\/title>/);
  assert.ok(result.html.includes('03/01/2025')); assert.ok(!result.html.includes('10/01/2025'));
  assert.ok(result.html.includes('CONFIRMADA'));
  assert.ok(result.html.includes('Bs. 450.00')); assert.ok(result.html.includes('ABONO PARCIAL'));
  assert.ok(result.html.includes('Observación de la venta')); assert.ok(!result.html.includes('No usar esta nota'));
  const document = app.builtSales[0];
  assert.equal(document.initialPayment, 100); assert.equal(document.total, 650); assert.equal(document.totalPagado, 200);
  assert.equal(document.estado, 'activa'); assert.equal(document.metodoPago, 'por_pagar'); assert.equal(document.includeSello, true);
  assert.equal(document.includeSignature, true); assert.deepEqual(app.downloads, []);
  assert.equal(result.fileName, 'NE-CLIENTE-HISTORICO-DE-ENTREGA-7.pdf');
  const sale = preview('sale', novaled, false, 0, 42, undefined, patch); const saleResult = await sale.load();
  assert.match(saleResult.html, /<title>NOTA DE VENTA #42<\/title>/);
  assert.equal(sale.builtSales[0].initialPayment, 100); assert.ok(!saleResult.html.includes('Artículo de la nota emitida'));
  const noScheduledDate = preview('delivery', novaled, false, 0, 42, undefined, { ...patch, deliverySnapshot: { ...patch.deliverySnapshot, deliveryDate: null } });
  const fallback = await noScheduledDate.load();
  assert.ok(fallback.html.includes('02/01/2025')); assert.ok(!fallback.html.includes('10/01/2025'));
});

test('Novaled no descarga la venta como entrega cuando falta la identidad de su nota', async () => {
  const app = preview('delivery', true, true, 0, 42, undefined, { deliverySnapshot: undefined });
  await assert.rejects(app.load(), /datos de la nota de entrega/);
  assert.deepEqual(app.downloads, []);
});

for (const novaled of [false, true]) for (const kind of ['quote', 'sale', 'delivery'] as const) {
  const label = `${novaled ? 'Novaled' : 'Lumis'} ${kind}`;
  for (const [mode, online, pending, id] of [
    ['offline', false, 0, 1], ['pending', true, 1, 1], ['local record', true, 0, 1e12 + 1],
  ] as const) test(`${label}: ${mode} genera el PDF desde la copia local y conserva su referencia`, async () => {
    const app = preview(kind, novaled, online, pending, id); const result = await app.load();
    assert.ok(result.html.includes(kind === 'quote' ? 'COTIZACIÓN' : kind === 'sale' ? 'NOTA DE VENTA' : 'NOTA DE ENTREGA'));
    assert.ok(result.html.includes('P-LOCAL-1')); assert.equal(result.pdf, undefined); assert.deepEqual(app.downloads, []);
  });
  test(`${label}: al perder la conexión durante la descarga usa el PDF local`, async () => {
    const app = preview(kind, novaled, true, 0, 1, 'Network request failed'); const result = await app.load();
    assert.ok(result.html); assert.equal(result.pdf, undefined);
    assert.equal(app.downloads.length, novaled ? 1 : 0);
  });
  test(`${label}: una sesión rechazada no se oculta con el PDF local`, async () => {
    const app = preview(kind, novaled, true, 0, 1, 'La sesión ha vencido. Vuelve a iniciar sesión.');
    if (novaled) await assert.rejects(app.load(), /sesión ha vencido/); else assert.ok((await app.load()).html);
  });
}
