import test from "node:test";
import assert from "node:assert/strict";
import { buildQuoteHtml } from "../../apps/mobile/src/lib/quoteDocument";
import { buildDeliveryNoteHtml } from "../../apps/mobile/src/lib/deliveryDocument";
import { documentEditAccess } from "../../apps/mobile/src/lib/documentAccess";
import { changedQuoteOptions } from "../../apps/mobile/src/lib/quoteOptions";
import type { CompanyLicense } from "../../apps/mobile/src/lib/api";
import {
  sampleBusiness,
  sampleQuote,
  sampleSale,
  sampleImages,
  sampleFonts,
} from "./documentFixtures";
const saleHtml = (delivery: boolean, business = sampleBusiness) =>
  buildDeliveryNoteHtml({
    documentType: delivery ? "delivery" : "sale",
    sale: sampleSale,
    business,
    branchName: "Central",
    images: sampleImages,
    fonts: sampleFonts,
  });

test('Novaled móvil usa la plantilla de venta de Lumis y detalla crédito, abonos y saldo', () => {
  for (const [paid, status, credit] of [[0, 'Por cobrar', true], [50, 'Abono parcial', true], [200, 'Pagado', false]] as const) {
    const html = buildDeliveryNoteHtml({ documentType: 'sale', showPaymentSummary: true,
      sale: { ...sampleSale, id: 999, number: 42, total: 200, totalPagado: paid, clientName: 'Cliente del documento', client: { id: 1, name: 'Nombre de catálogo', phone: null, email: null } },
      business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts });
    assert.ok(html.includes('NOTA DE VENTA #42'));
    assert.ok(html.includes('Cliente del documento'));
    assert.ok(!html.includes('Nombre de catálogo'));
    assert.ok(html.includes(`<td>${status}</td>`));
    assert.equal(html.includes('Venta a crédito'), credit);
    assert.ok(html.includes(`Total abonado:</td><td>Bs. ${paid.toFixed(2)}`));
    assert.ok(html.includes(`Saldo pendiente:</td><td>Bs. ${(200 - paid).toFixed(2)}`));
    assert.ok(!html.includes('Entregué conforme') && !html.includes('Recibí conforme'));
  }
  assert.ok(!saleHtml(false).includes('class="payment-summary"'));
  assert.ok(!saleHtml(true).includes('class="payment-summary"'));
  const discounted = buildDeliveryNoteHtml({ documentType: 'sale', showPaymentSummary: true,
    sale: { ...sampleSale, total: sampleSale.total - 10, totalPagado: 20 },
    business: sampleBusiness, branchName: null, images: sampleImages, fonts: sampleFonts });
  assert.ok(discounted.includes('Descuento:</td><td class="value">- Bs. 10.00'));
});

test("venta sin firmas de recepción; entrega conserva sus firmas y los mismos totales", () => {
  const sale = saleHtml(false),
    delivery = saleHtml(true);
  assert.match(sale, /NOTA DE VENTA/);
  assert.doesNotMatch(
    sale,
    /Entregué conforme|Recibí conforme|class="signature-section"/,
  );
  assert.match(delivery, /NOTA DE ENTREGA/);
  assert.match(delivery, /Entregué conforme/);
  assert.match(delivery, /Recibí conforme/);
  for (const html of [sale, delivery]) {
    assert.match(html, /890\.00/);
    assert.match(html, /650\.00/);
    assert.match(html, /240\.00/);
  }
});

test('la entrega conserva ambas conformidades con todos los adicionales apagados', () => {
  const html = saleHtml(true);
  assert.match(html, /Entregué conforme/);
  assert.match(html, /Recibí conforme/);
  assert.doesNotMatch(html, /alt="Sello"|class="document-notes"/);
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
    assert.match(html, /colspan="7"/);
    assert.match(html, /width: 48%/);
    assert.match(html, /Interruptor termomagnético/);
    assert.match(html, /890\.00/);
  }
  const normal = saleHtml(false);
  assert.match(normal, /<th class="col-brand">Marca/);
  assert.match(normal, /<th class="col-origin">Procedencia/);
  assert.match(normal, /colspan="9"/);
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
