import test from "node:test";
import assert from "node:assert/strict";
import { buildQuoteHtml } from "../../apps/mobile/src/lib/quoteDocument";
import { buildDeliveryNoteHtml } from "../../apps/mobile/src/lib/deliveryDocument";
import { documentEditAccess } from "../../apps/mobile/src/lib/documentAccess";
import { changedQuoteOptions } from "../../apps/mobile/src/lib/quoteOptions";
import { canShowSalePaymentSummary } from "../../apps/mobile/src/lib/salePaymentSummary";
import type { CompanyLicense } from "../../apps/mobile/src/lib/api";
import {
  sampleBusiness,
  sampleQuote,
  sampleSale,
  sampleImages,
  sampleFonts,
} from "./documentFixtures";

test('el PDF de cotización mantiene nombre, cantidad y unidad escaneados vacíos y muestra precio cero', () => {
  const html = buildQuoteHtml({
    quote: { ...sampleQuote, total: 0, items: [{ ...sampleQuote.items[0], fromScan: true,
      description: '', quantity: 0, unit: '', unitPrice: 0, subtotal: 0 }] },
    business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts,
  });
  const rows = html.match(/<table class="items">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)![1];
  assert.match(rows, /<span class="art-name"><\/span>/);
  assert.match(rows, /<td class="col-qty"><\/td>/);
  assert.match(rows, /<td class="col-unit"><\/td>/);
  assert.match(rows, /<td class="col-price col-money">Bs\. 0\.00<\/td>/);
  assert.doesNotMatch(rows, /Unidad|NaN|null|undefined/);
});

test('los valores leídos del escaneo permanecen visibles en el PDF y los manuales conservan su unidad de respaldo', () => {
  const input = { business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts };
  const html = buildQuoteHtml({ ...input, quote: { ...sampleQuote, items: [{ ...sampleQuote.items[0], fromScan: true, quantity: 2.5, unit: 'Metro', unitPrice: 3 }] } });
  assert.match(html, /<td class="col-qty">2\.50<\/td>/);
  assert.match(html, /<td class="col-unit">Metro<\/td>/);
  assert.match(html, /<td class="col-price col-money">Bs\. 3\.00<\/td>/);
  const manual = buildQuoteHtml({ ...input, quote: { ...sampleQuote, items: [{ ...sampleQuote.items[0], unit: '' }] } });
  assert.match(manual, /<td class="col-unit">Unidad<\/td>/);
});

test('PDFs use and escape document client details, including explicit empty values', () => {
  const details = { name: 'Proyecto <Norte>', phone: '71111111', email: 'norte@example.com', address: 'Av. <Principal>', nit: '12345' };
  const common = { business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts };
  for (const html of [
    buildQuoteHtml({ ...common, quote: { ...sampleQuote, clientDetails: details } }),
    buildDeliveryNoteHtml({ ...common, documentType: 'sale', sale: { ...sampleSale, clientDetails: details } }),
  ]) {
    assert.ok(html.includes('Proyecto &lt;Norte&gt;'));
    assert.ok(html.includes('Av. &lt;Principal&gt;'));
    assert.ok(html.includes('norte@example.com'));
    assert.ok(html.includes('NIT / CI: 12345'));
    assert.ok(!html.includes('Proyecto <Norte>'));
  }
  const html = buildQuoteHtml({ ...common, quote: { ...sampleQuote,
    client: { id: 1, name: 'Catálogo', phone: '77777777', email: 'catalog@example.com' },
    clientDetails: { ...details, phone: null, email: null, address: null, nit: null },
  } });
  assert.ok(!html.includes('77777777')); assert.ok(!html.includes('catalog@example.com'));
});
const saleHtml = (delivery: boolean, business = sampleBusiness) =>
  buildDeliveryNoteHtml({
    documentType: delivery ? "delivery" : "sale",
    sale: sampleSale,
    business,
    branchName: "Central",
    images: sampleImages,
    fonts: sampleFonts,
  });

test('venta sigue el resumen de Novaled web con abono inicial, saldo original y estado', () => {
  for (const [initial, status] of [[0, 'POR COBRAR'], [50, 'ABONO PARCIAL'], [200, 'PAGADO']] as const) {
    const html = buildDeliveryNoteHtml({ documentType: 'sale', showPaymentSummary: true,
      sale: { ...sampleSale, id: 999, number: 42, total: 200, initialPayment: initial, totalPagado: 200, estadoPago: 'pagado', metodoPago: 'por_pagar', clientName: 'Cliente del documento' },
      business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts });
    assert.ok(html.includes('NOTA DE VENTA #42') && html.includes('Cliente del documento'));
    assert.ok(html.includes('class="sale-summary"') && html.includes(status));
    assert.match(html, new RegExp('Abono:</span><span class="payment-value">Bs. ' + initial.toFixed(2)));
    assert.match(html, new RegExp('Saldo pendiente:</span><span class="payment-value">Bs. ' + (200-initial).toFixed(2)));
    assert.ok(!html.includes('Entregué conforme') && !html.includes('Recibí conforme'));
  }
});

test('el resumen solicitado conserva el abono inicial y el acumulado disponible en documentos antiguos', () => {
  const common = { business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts, showPaymentSummary: true };
  const paid = buildDeliveryNoteHtml({ ...common, documentType: 'sale', sale: { ...sampleSale, total: 200, initialPayment: 200, totalPagado: 200, estadoPago: 'pagado', metodoPago: 'por_pagar' } });
  assert.ok(paid.includes('class="sale-summary"') && paid.includes('PAGADO'));
  assert.ok(paid.includes('Saldo pendiente:</span><span class="payment-value">Bs. 0.00'));
  const legacy = buildDeliveryNoteHtml({ ...common, documentType: 'sale', sale: { ...sampleSale, total: 200, initialPayment: null, totalPagado: 80 } });
  assert.ok(legacy.includes('Abono:</span><span class="payment-value">Bs. 80.00'));
  const cancelled = buildDeliveryNoteHtml({ ...common, documentType: 'sale', sale: { ...sampleSale, estado: 'anulada' } });
  assert.ok(cancelled.includes('ANULADO'));
});

test('los abonos se imprimen solo a petición sin mover los totales ni cambiar la venta', () => {
  const input = { business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts };
  const sale = { ...sampleSale, total: 200, initialPayment: 50, totalPagado: 80, metodoPago: 'por_pagar' as const };
  const snapshot = JSON.stringify(sale);
  for (const showPaymentSummary of [undefined, false]) {
    const html = buildDeliveryNoteHtml({ ...input, documentType: 'sale', sale, showPaymentSummary });
    assert.doesNotMatch(html, /<table class="payment-facts"|Abono:|Estado de pago:/);
    assert.match(html, /<td class="sale-payments"><\/td><td class="sale-total">/);
    assert.match(html, /\.sale-total\{width:42\.4%\}/);
    assert.match(html, /<table class="totals-wrap" data-pdf-totals>/);
    assert.match(html, /<td class="value">Bs\. 200\.00<\/td>/);
  }
  const enabled = buildDeliveryNoteHtml({ ...input, documentType: 'sale', sale, showPaymentSummary: true });
  assert.match(enabled, /Abono:<\/span><span class="payment-value">Bs\. 50\.00/);
  assert.match(enabled, /Saldo pendiente:<\/span><span class="payment-value">Bs\. 150\.00/);
  assert.equal(JSON.stringify(sale), snapshot);
});

test('una venta ordinaria pagada en su totalidad no imprime abonos aunque se soliciten', () => {
  const input = { business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts };
  for (const metodoPago of ['efectivo', 'qr', 'transferencia'] as const) {
    const sale = { ...sampleSale, total: 200, initialPayment: 200, totalPagado: 200, estadoPago: 'pagado' as const,
      metodoPago, payments: [{ id: 1, monto: 200, nota: null, createdAt: sampleSale.createdAt }] };
    assert.equal(canShowSalePaymentSummary(sale), false);
    const html = buildDeliveryNoteHtml({ ...input, documentType: 'sale', sale, showPaymentSummary: true });
    assert.doesNotMatch(html, /<table class="payment-facts"|Abono:|Estado de pago:/);
    assert.match(html, /<td class="value">Bs\. 200\.00<\/td>/);
  }
});

test('los créditos y las ventas saldadas con abonos conservan la opción de mostrar pagos', () => {
  const sale = { ...sampleSale, total: 200, totalPagado: 200, estadoPago: 'pagado' as const, metodoPago: 'efectivo' as const };
  assert.equal(canShowSalePaymentSummary({ ...sale, initialPayment: 50 }), true);
  assert.equal(canShowSalePaymentSummary({ ...sale, initialPayment: 200, metodoPago: 'por_pagar' }), true);
  assert.equal(canShowSalePaymentSummary({ ...sale, initialPayment: null, payments: [
    { id: 1, monto: 50, nota: null, createdAt: sale.createdAt },
    { id: 2, monto: 150, nota: null, createdAt: sale.createdAt },
  ] }), true);
  assert.equal(canShowSalePaymentSummary({ ...sale, initialPayment: null, estadoPago: 'por_cobrar', totalPagado: 80 }), true);
});

test('crédito sin abono inicial conserva el resumen tras pagarse completo con un único pago', () => {
  const input = { business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts };
  for (const metodoPago of ['efectivo', 'transferencia'] as const) {
    const sale = { ...sampleSale, total: 200, totalPagado: 200, estadoPago: 'pagado' as const, metodoPago,
      initialPayment: 0, payments: [{ id: 1, monto: 200, nota: null, createdAt: sampleSale.createdAt }] };
    assert.equal(canShowSalePaymentSummary(sale), true);
    const html = buildDeliveryNoteHtml({ ...input, documentType: 'sale', sale, showPaymentSummary: true });
    assert.match(html, /Abono:<\/span><span class="payment-value">Bs\. 0\.00/);
    assert.match(html, /Saldo pendiente:<\/span><span class="payment-value">Bs\. 200\.00/);
    assert.equal(canShowSalePaymentSummary({ ...sale, initialPayment: null }), false);
    assert.equal(canShowSalePaymentSummary({ ...sale, initialPayment: undefined }), false);
  }
});

test('entrega imprime cinco columnas con unidad y subtotal, estado y saldo sin precio unitario', () => {
  const sale = saleHtml(false), delivery = saleHtml(true);
  assert.ok(sale.includes('Precio unitario') && sale.includes('TOTAL'));
  assert.ok(!sale.includes('Entregué conforme') && !sale.includes('Recibí conforme'));
  assert.ok(delivery.includes('Entregué conforme') && delivery.includes('Recibí conforme'));
  assert.ok(delivery.includes('Estado de pago:') && delivery.includes('Saldo pendiente:'));
  assert.ok(!delivery.includes('Precio unitario') && !delivery.includes('Sub total:'));
  assert.ok(!delivery.includes('<th class="col-code">'));
  const table = delivery.match(/<table class="items">([\s\S]*?)<\/table>/)![1];
  assert.deepEqual([...table.matchAll(/<th class="[^\"]+">([^<]+)<\/th>/g)].map(match => match[1]), ['N°', 'Artículo', 'Cant.', 'Unidad', 'Subtotal']);
  const rows = table.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
  for (const row of rows.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) assert.equal([...row[1].matchAll(/<td\b/g)].length, 5);
  assert.match(rows, /<td class="col-unit">Unidad<\/td>/);
  assert.match(rows, /<td class="col-subt col-money">Bs\. 650\.00<\/td>/);
  assert.match(rows, /<td class="col-subt col-money">Bs\. 240\.00<\/td>/);
  assert.match(delivery, /colspan="5"/);
});

test('la entrega conserva ambas conformidades con todos los adicionales apagados', () => {
  const html = saleHtml(true);
  assert.match(html, /Entregué conforme/);
  assert.match(html, /Recibí conforme/);
  assert.doesNotMatch(html, /alt="Sello"|class="document-notes"/);
});

test('nombre en firma de entrega es una opción de impresión y se escapa sin modificar al vendedor', () => {
  const render = (mode: 'asesor' | 'otro' | 'sin_nombre', name = '') => buildDeliveryNoteHtml({
    documentType: 'delivery', deliverySignature: { mode, name }, sale: { ...sampleSale, sellerName: 'Vendedor original' },
    business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts,
  });
  assert.match(render('asesor'), /data-pdf-delivery-sender>Vendedor original/);
  assert.match(render('otro', 'Ana <Norte>'), /data-pdf-delivery-sender>Ana &lt;Norte&gt;/);
  assert.match(render('sin_nombre'), /data-pdf-delivery-sender><\/td>/);
});

test('notas, firma de empresa y sello se pueden activar por separado en la venta', () => {
  const render = (patch: Partial<typeof sampleSale>) => buildDeliveryNoteHtml({
    documentType: 'sale', sale: { ...sampleSale, ...patch }, business: sampleBusiness,
    branchName: null, images: { ...sampleImages, sello: 'data:image/png;base64,c2VsbG8=' }, fonts: sampleFonts,
  });
  const seal = render({ includeSello: true });
  assert.match(seal, /alt="Sello"/);
  assert.doesNotMatch(seal, /<div class="signature-line"|Entregué conforme|Recibí conforme/);
  const signature = render({ includeSignature: true });
  assert.match(signature, /<div class="signature-line"/);
  assert.doesNotMatch(signature, /alt="Sello"|Entregué conforme|Recibí conforme/);
  const note = 'Entrega <programada> & confirmada';
  assert.doesNotMatch(render({ notes: note }), /class="document-notes"/);
  assert.match(render({ notes: note, showNotes: true }), /Entrega &lt;programada&gt; &amp; confirmada/);
});

test('el sello de la cotización no necesita activar el pie de firma', () => {
  const html = buildQuoteHtml({
    quote: { ...sampleQuote, includeSeal: true, includeSignature: false, showNotes: false },
    business: sampleBusiness, branchName: null,
    images: { ...sampleImages, sello: 'data:image/png;base64,c2VsbG8=' }, fonts: sampleFonts,
  });
  assert.match(html, /alt="Sello"/);
  assert.doesNotMatch(html, /<div class="signature-line"|class="footer-notes-title"/);
});
test("preferencias de empresa ocultan columnas completas y aprovechan el ancho libre", () => {
  const business = {
    ...sampleBusiness,
    pdf_mostrar_marca: false,
    pdf_mostrar_procedencia: false,
  };
  const quote = buildQuoteHtml({
    quote: sampleQuote,
    business,
    branchName: null,
    images: sampleImages,
    fonts: sampleFonts,
  });
  for (const html of [
    quote,
    saleHtml(false, business),
    saleHtml(true, business),
  ]) {
    assert.doesNotMatch(html, /<t[dh] class="col-(brand|origin)"/);
    assert.match(html, /colspan="[57]"/);
    assert.match(html, /Interruptor termomagnético/);
    assert.match(html, /890\.00/);
  }
  const normal = saleHtml(false);
  assert.ok(!normal.includes('<th class="col-brand">') && !normal.includes('<th class="col-origin">'));
  assert.match(normal, /Marca: Aurora/);
  assert.match(normal, /Procedencia: Bolivia/);
  assert.match(normal, /colspan="7"/);
  assert.equal(
    sampleSale.items[0].marca,
    "Aurora",
    "Ocultar un dato del PDF no lo borra del artículo",
  );
});
test("una columna sin datos no aparece aunque la empresa la tenga habilitada", () => {
  const quote = {
    ...sampleQuote,
    items: sampleQuote.items.map((item) => ({
      ...item,
      marca: null,
      procedencia: null,
    })),
  };
  const html = buildQuoteHtml({
    quote,
    business: sampleBusiness,
    branchName: null,
    images: sampleImages,
    fonts: sampleFonts,
  });
  assert.doesNotMatch(html, /<th class="col-(brand|origin)"/);
  assert.match(html, /colspan="7"/);
});
test("sello, notas visibles y pie de firma se guardan sin enviar texto de notas sin cambios", () => {
  const same = {
    notes: sampleQuote.notes ?? "",
    includeSeal: sampleQuote.includeSeal,
    showNotes: sampleQuote.showNotes,
    includeSignature: sampleQuote.includeSignature,
  };
  assert.deepEqual(changedQuoteOptions(sampleQuote, same), {});
  assert.deepEqual(
    changedQuoteOptions(sampleQuote, {
      ...same,
      includeSeal: true,
      includeSignature: false,
    }),
    { includeSeal: true, includeSignature: false },
  );
  assert.deepEqual(
    changedQuoteOptions(sampleQuote, { ...same, notes: "Nueva nota" }),
    { notes: "Nueva nota" },
  );
});
test("la edición exige plan de pago activo; consulta y cuentas Novaled conservan sus reglas", () => {
  const license = {
    readOnly: false,
    features: { editDocuments: false, brandColors: false },
  } as CompanyLicense;
  assert.equal(documentEditAccess(null, false), "checking");
  assert.equal(documentEditAccess(license, false), "pro");
  assert.equal(
    documentEditAccess(
      { ...license, features: { ...license.features, editDocuments: true } },
      false,
    ),
    "allowed",
  );
  assert.equal(
    documentEditAccess(
      {
        ...license,
        readOnly: true,
        features: { ...license.features, editDocuments: true },
      },
      false,
    ),
    "read_only",
  );
  assert.equal(documentEditAccess(null, true), "allowed");
});
