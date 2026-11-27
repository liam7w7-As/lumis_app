import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { buildDeliveryNoteHtml } from '../../apps/mobile/src/lib/deliveryDocument';
import { sampleBusiness, sampleFonts, sampleImages, sampleSale } from './documentFixtures';
import { documentFileName } from '../../apps/mobile/src/lib/documentFileName';
import { canShowSalePaymentSummary } from '../../apps/mobile/src/lib/salePaymentSummary';

for (const novaled of [false, true]) {
  test(`${novaled ? 'Novaled' : 'Lumis'} previews select the correct PDF source for sale and delivery`, async () => {
    const downloads: string[] = [];
    const jsx = (type: unknown, props: any) => ({ type, props });
    const modules: Record<string, unknown> = {
      react: { useCallback: (fn: unknown) => fn, useState: (value: unknown) => [value, () => {}] },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View' },
      '@expo/vector-icons/Ionicons': 'Icon',
      'expo-router': { router: {}, useLocalSearchParams: () => ({ signature: 'asesor' }) },
      '../components/DeliverySignatureOptions': { DeliverySignatureOptions: 'DeliverySignatureOptions' },
      '../components/PdfPaymentOption': { PdfPaymentOption: 'PdfPaymentOption' },
      '../lib/salePaymentSummary': { canShowSalePaymentSummary },
      '../components/FormModal': { FormModal: 'FormModal' }, '../components/PrimaryButton': { PrimaryButton: 'Button' },
      '../theme/ThemeContext': { useTheme: () => ({ colors: {} }) },
      '../components/DocumentPreviewScreen': { DocumentPreviewScreen: 'Preview' },
      '../lib/api': { api: { saleDetail: async () => ({ sale: { ...sampleSale, number: 42, total: 200, totalPagado: 50,
        deliverySnapshot: { id: 7, number: 7, clientName: 'UMSA' } } }), business: async () => ({ business: sampleBusiness }) }, mediaUrl: (url: unknown) => url },
      '../lib/documentFileName': { documentFileName },
      '../lib/documentBusiness': { documentBusiness: (value: unknown) => value },
      '../lib/docAssets': { loadDocFonts: async () => sampleFonts, loadDocImages: async () => ({ ...sampleImages, warnings: [] }) },
      '../lib/deliveryDocument': { buildDeliveryNoteHtml },
      '../lib/backend': { IS_NOVALED: novaled },
      '../offline/bridge': { getOfflineGateway: () => null },
      '../lib/pdfFile': { downloadNovaledPdf: async (kind: string) => { downloads.push(kind); return { uri: 'file:///server.pdf', base64: 'pdf', fileName: 'server.pdf' }; } },
    };
    const source = readFileSync(new URL('../../apps/mobile/src/screens/DeliveryPreviewScreen.tsx', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    const exports: any = {};
    runInNewContext(outputText, { exports, require: (key: string) => { assert.ok(key in modules, key); return modules[key]; } });
    const saleScreen = exports.DeliveryPreviewScreen({ saleId: 1, documentType: 'sale' });
    const result = await saleScreen.props.children[0].props.loadDocument('session');
    if (novaled) {
      assert.equal(result.pdf.uri, 'file:///server.pdf'); assert.deepEqual(downloads, ['sale']);
      assert.equal(result.html, undefined);
    } else {
      assert.ok(result.html.includes('NOTA DE VENTA #42') && result.html.includes('class="sale-summary"'));
      assert.equal(downloads.length, 0);
    }
    const deliveryScreen = exports.DeliveryPreviewScreen({ saleId: 1, documentType: 'delivery' });
    const delivery = await deliveryScreen.props.children[0].props.loadDocument('session');
    if (novaled) { assert.equal(delivery.pdf.uri, 'file:///server.pdf'); assert.deepEqual(downloads, ['sale', 'delivery']); }
    else assert.ok(delivery.html.includes('NOTA DE ENTREGA'));
  });
}
