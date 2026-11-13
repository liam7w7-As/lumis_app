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
