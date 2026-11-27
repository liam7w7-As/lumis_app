import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { documentFileName } from '../../apps/mobile/src/lib/documentFileName';
import { sampleBusiness, sampleFonts, sampleImages, sampleQuote, sampleSale } from './documentFixtures';

test('los PDF usan COT/NV/NE, el cliente del documento y su número visible', () => {
  for (const [kind, prefix] of [['quote', 'COT'], ['sale', 'NV'], ['delivery', 'NE']] as const)
    assert.equal(documentFileName(kind, { id: 9, number: 435, clientName: 'UMSA' }), `${prefix}-UMSA-435.pdf`);
  assert.equal(documentFileName('quote', { id: 12, clientName: ' UMsa ' }), 'COT-UMSA-12.pdf');
  assert.equal(documentFileName('quote', { id: 1e12, number: 'P-device-4', clientName: 'UMSA' }), 'COT-UMSA-P-DEVICE-4.pdf');
  assert.equal(documentFileName('quote', { id: 435, clientName: 'UMSA' }), 'COT-UMSA-435.pdf');
  assert.equal(documentFileName('quote', { id: 435, clientName: 'Nombre del catálogo',
    clientDetails: { name: 'Nombre en esta cotización', phone: null, email: null, address: null, nit: null } }),
  'COT-NOMBRE-EN-ESTA-COTIZACION-435.pdf');
});

test('nombres de archivo seguros, acotados y sin cliente conservan la identidad del documento', () => {
  assert.equal(documentFileName('sale', { id: 42, clientName: '  José / Peña: "A&B"  ' }), 'NV-JOSE-PENA-A-B-42.pdf');
  for (const clientName of [null, '', '  ', '\\../:*?"<>|', '💜'])
    assert.equal(documentFileName('delivery', { id: 7, clientName }), 'NE-SIN-CLIENTE-7.pdf');
  const name = documentFileName('quote', { id: 435, clientName: '界'.repeat(500) });
  assert.ok(Buffer.byteLength(name, 'utf8') < 255);
  assert.ok(name.endsWith('-435.pdf'));
  assert.ok(!/[\\/:*?"<>|\x00-\x1f]/.test(name));
});

type Element = { type: unknown; props: Record<string, any> };
function screen(kind: 'quote' | 'sale' | 'delivery', novaled: boolean, online: boolean) {
  const downloads: { kind: string; fileName: string }[] = [];
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const quote = { ...sampleQuote, number: online ? 435 : 'P-MOBILE-4', clientName: 'Otro cliente',
    clientDetails: { name: 'UMSA', phone: null, email: null, address: null, nit: null } };
  const sale = { ...sampleSale, number: 128, clientName: 'UMSA', clientDetails: undefined,
    deliverySnapshot: { id: 700, number: online ? 76 : 'P-MOBILE-5', clientName: 'Cliente de entrega', clientDetails: undefined } };
  const modules: Record<string, unknown> = {
    react: { useCallback: (fn: unknown) => fn, useState: (value: unknown) => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View' },
    '@expo/vector-icons/Ionicons': 'Icon', 'expo-router': { router: {}, useLocalSearchParams: () => ({}) },
    '../components/FormModal': { FormModal: 'FormModal' }, '../components/PrimaryButton': { PrimaryButton: 'Button' },
    '../components/DocumentPreviewScreen': { DocumentPreviewScreen: 'Preview' },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {} }) },
    '../lib/api': { api: { quoteDetail: async () => ({ quote }), saleDetail: async () => ({ sale }),
      business: async () => ({ business: sampleBusiness }) }, mediaUrl: (value: unknown) => value },
    '../lib/documentBusiness': { documentBusiness: (value: unknown) => value },
    '../lib/docAssets': { loadDocFonts: async () => sampleFonts, loadDocImages: async () => ({ ...sampleImages, warnings: [] }) },
    '../lib/quoteDocument': { buildQuoteHtml: () => '<html>quote</html>' },
    '../lib/deliveryDocument': { buildDeliveryNoteHtml: () => '<html>sale</html>' },
    '../lib/documentFileName': { documentFileName },
    '../lib/backend': { IS_NOVALED: novaled },
    '../lib/pdfFile': {
      downloadNovaledQuotePdf: async (_id: number, fileName: string) => {
        downloads.push({ kind: 'quote', fileName }); return { uri: 'file:///cache/' + fileName, fileName, base64: 'pdf' };
      },
      downloadNovaledPdf: async (type: string, _id: number, fileName: string) => {
        downloads.push({ kind: type, fileName }); return { uri: 'file:///cache/' + fileName, fileName, base64: 'pdf' };
      },
    },
    '../offline/bridge': { getOfflineGateway: () => ({ status: () => ({ online, pending: 0 }) }) },
  };
  const name = kind === 'quote' ? 'QuotePreviewScreen' : 'DeliveryPreviewScreen';
  const source = readFileSync(new URL(`../../apps/mobile/src/screens/${name}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports: any = {};
  runInNewContext(outputText, { exports, require(key: string) { assert.ok(key in modules, key); return modules[key]; } });
  const element = exports[name](kind === 'quote' ? { quoteId: 42 } : { saleId: 42, documentType: kind }) as Element;
  return { downloads, load: () => (kind === 'quote' ? element : element.props.children[0]).props.loadDocument('session') };
}

for (const novaled of [false, true]) for (const online of [false, true]) for (const kind of ['quote', 'sale', 'delivery'] as const)
  test(`${novaled ? 'Novaled' : 'Lumis'} ${kind} ${online ? 'online' : 'offline'} prepara el archivo con el cliente y número del PDF`, async () => {
    const app = screen(kind, novaled, online), result = await app.load();
    const expected = kind === 'quote' ? `COT-UMSA-${online ? '435' : 'P-MOBILE-4'}.pdf`
      : kind === 'sale' ? 'NV-UMSA-128.pdf' : `NE-CLIENTE-DE-ENTREGA-${online ? '76' : 'P-MOBILE-5'}.pdf`;
    assert.equal(result.fileName, expected);
    if (novaled && online) {
      assert.equal(result.pdf.fileName, expected);
      assert.ok(result.pdf.uri.endsWith('/' + expected));
      assert.deepEqual(app.downloads, [{ kind, fileName: expected }]);
    } else {
      assert.ok(result.html); assert.deepEqual(app.downloads, []);
    }
  });

test('el PDF generado y el descargado se guardan realmente con el nombre COT/NV/NE que se comparte', async () => {
  const files = new Map<string, Buffer>();
  const bytes = Buffer.from('%PDF-1.7\nDocumento de prueba\n%%EOF');
  class Directory {
    uri: string;
    constructor(parent: Directory | string, name: string) { this.uri = (typeof parent === 'string' ? parent : parent.uri) + '/' + name; }
    exists = false;
    create() {} list() { return []; }
  }
  class File {
    uri: string;
    constructor(parent: Directory | string, name?: string) { this.uri = name === undefined ? String(parent) : (typeof parent === 'string' ? parent : parent.uri) + '/' + name; }
    create() { files.set(this.uri, Buffer.alloc(0)); }
    write(value: string | Uint8Array, options?: { encoding: string }) {
      files.set(this.uri, typeof value === 'string' ? Buffer.from(value, options?.encoding as BufferEncoding) : Buffer.from(value));
    }
    get exists() { return files.has(this.uri); }
    async base64() { return files.get(this.uri)!.toString('base64'); }
    delete() { files.delete(this.uri); }
  }
  const requests: string[] = [];
  const modules: Record<string, unknown> = {
    'expo-print': { printToFileAsync: async () => ({ uri: 'file:///print/original.pdf', base64: bytes.toString('base64') }) },
    'expo-file-system': { Directory, File, Paths: { cache: 'file:///cache' } },
    './backend': { API_URL: 'https://api.example.test', NOVALED_PREFIX: '/api/v1/lumis' },
    './authEvents': { notifySessionExpiry() {} },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/lib/pdfFile.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports: any = {};
  runInNewContext(outputText, { exports, AbortController, setTimeout, clearTimeout, Uint8Array,
    fetch: async (url: string) => { requests.push(url); return { ok: true, arrayBuffer: async () => Uint8Array.from(bytes).buffer }; },
    require(key: string) { assert.ok(key in modules, key); return modules[key]; } });
  for (const kind of ['quote', 'sale', 'delivery'] as const) {
    const fileName = documentFileName(kind, { id: 435, clientName: 'UMSA' });
    const generated = await exports.generatePdfFile('<html>PDF</html>', fileName);
    const downloaded = await exports.downloadNovaledPdf(kind, 435, fileName, 'test-session');
    for (const pdf of [generated, downloaded]) {
      assert.equal(pdf.fileName, fileName);
      assert.ok(pdf.uri.endsWith('/' + fileName));
      assert.deepEqual(files.get(pdf.uri), bytes);
      exports.assertPdfAvailable(pdf);
    }
    assert.notEqual(generated.uri, downloaded.uri, 'Dos vistas no reemplazan un PDF que se está compartiendo');
  }
  assert.deepEqual(requests, ['https://api.example.test/api/v1/lumis/quotes/435/pdf',
    'https://api.example.test/api/v1/lumis/sales/435/pdf', 'https://api.example.test/api/v1/lumis/sales/435/delivery/pdf']);
});

test('las rutas de vista previa Novaled conservan el cliente y número de cada documento', async () => {
  for (const kind of ['quote', 'sale', 'delivery'] as const) {
    const downloads: { kind: string; fileName: string }[] = [];
    const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
    const modules: Record<string, unknown> = {
      react: { useCallback: (fn: unknown) => fn }, 'react/jsx-runtime': { jsx, jsxs: jsx },
      '../components/DocumentPreviewScreen': { DocumentPreviewScreen: 'Preview' },
      '../lib/documentFileName': { documentFileName },
      '../lib/novaled': { novaled: { quote: async () => ({ data: { id: 123, number: 435, version: 2, clientName: 'UMSA' } }),
        sale: async () => ({ data: { id: 123, number: 128, clientName: 'UMSA' } }) } },
      '../lib/api': { api: { saleDetail: async () => ({ sale: { id: 123, number: 128, clientName: 'UMSA',
        deliverySnapshot: { id: 777, number: 76, clientName: 'Cliente original de entrega' } } }) } },
      '../lib/pdfFile': { downloadNovaledQuotePdf: async (_id: number, fileName: string) => {
        downloads.push({ kind: 'quote', fileName }); return { uri: 'file:///' + fileName, fileName };
      }, downloadNovaledPdf: async (type: string, _id: number, fileName: string) => {
        downloads.push({ kind: type, fileName }); return { uri: 'file:///' + fileName, fileName };
      } },
    };
    const name = kind === 'quote' ? 'NovaledQuotePreviewScreen' : 'NovaledSalePreviewScreen';
    const source = readFileSync(new URL(`../../apps/mobile/src/screens/${name}.tsx`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    const exports: any = {};
    runInNewContext(outputText, { exports, Error, require(key: string) { assert.ok(key in modules, key); return modules[key]; } });
    const element = exports[name](kind === 'quote' ? { quoteId: 123 } : { saleId: 123, kind });
    const result = await element.props.loadDocument('test-session');
    const expected = kind === 'quote' ? 'COT-UMSA-435.pdf' : kind === 'sale' ? 'NV-UMSA-128.pdf' : 'NE-CLIENTE-ORIGINAL-DE-ENTREGA-76.pdf';
    assert.equal(result.fileName, expected);
    assert.equal(result.pdf.fileName, expected);
    assert.deepEqual(downloads, [{ kind, fileName: expected }]);
  }
});
