import { contrastText, forBackground } from './brandColors';
import { monto as montoLetras } from './numeroALetras';
import type { DocImages, DocFonts } from './docAssets';
import type { DocBusiness } from './quoteDocument';
import type { SaleDetail } from './api';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtHora(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const ii = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${ii}`;
}

export function buildDeliveryNoteHtml(input: {
  sale: SaleDetail;
  business: DocBusiness;
  branchName: string | null;
  images: DocImages;
  fonts: DocFonts;
}): string {
  const { sale, business, branchName, images, fonts } = input;

  const colorPrimario = forBackground(business.color_primario || '#5842F4');
  const colorOnPrimario = contrastText(colorPrimario);
  const moneda = business.moneda || 'Bs.';

  const fontFaces = [
    { weight: 400, src: fonts.regular },
    { weight: 500, src: fonts.medium },
    { weight: 600, src: fonts.semibold },
    { weight: 700, src: fonts.bold },
  ]
    .filter((f): f is { weight: number; src: string } => !!f.src)
    .map(
      (f) => `@font-face {
    font-family: 'Poppins';
    font-style: normal;
    font-weight: ${f.weight};
    src: url("${f.src}") format('truetype');
  }`,
    )
    .join('\n  ');

  const clientName = sale.client?.name ?? 'Sin Cliente';

  const dirPart = (business.direccion ?? '').trim();
  const ciudadPart = (business.ciudad ?? '').trim();
  const direccion = [dirPart, ciudadPart].filter(Boolean).join(' ') || null;

  const rows = sale.items
    .map(
      (it, i) => `
      <tr class="${i % 2 === 0 ? 'row-odd' : 'row-even'}">
        <td class="col-num">${i + 1}</td>
        <td class="col-code">${escapeHtml(it.codigoInterno ?? '-')}</td>
        <td class="col-art"><span class="art-name">${escapeHtml(it.description)}</span></td>
        <td class="col-brand">${escapeHtml(it.marca ?? '-')}</td>
        <td class="col-origin">${escapeHtml(it.procedencia ?? '-')}</td>
        <td class="col-qty">${fmtQty(it.quantity)}</td>
        <td class="col-unit">${escapeHtml(it.unit || 'Unidad')}</td>
        <td class="col-price col-money">${escapeHtml(moneda)} ${fmtMoney(it.unitPrice)}</td>
        <td class="col-subt col-money">${escapeHtml(moneda)} ${fmtMoney(it.subtotal)}</td>
      </tr>`,
    )
    .join('');

  const literal = `${montoLetras(sale.total)} ${escapeHtml(moneda)}${moneda.endsWith('.') ? '' : '.'}`;

  const iconImg = (src: string | null, alt: string) =>
    src ? `<img src="${src}" class="footer-icon" alt="${alt}">` : '';

  // El sello (con la firma encima) es opcional por venta; las etiquetas
  // «Entregué conforme» / «Recibí conforme» siempre van.
  const sealImages = (() => {
    if (!sale.includeSello) {
      return '<div class="seal-container"></div>';
    }
    if (images.firma && images.sello) {
      return `<div class="stacked-seal">
        <img src="${images.firma}" class="firma-overlap" alt="Firma">
        <img src="${images.sello}" class="sello-overlap" alt="Sello">
      </div>`;
    }
    if (images.sello) {
      return `<img src="${images.sello}" class="sello-only" alt="Sello">`;
    }
    if (images.firma) {
      return `<img src="${images.firma}" class="firma-only" alt="Firma">`;
    }
    return '<div class="seal-container"></div>';
  })();

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>NOTA DE ENTREGA #${sale.id}</title>
<style>
  ${fontFaces}
  @page { size: letter portrait; margin: 10mm 12mm 0 12mm; }
  * { box-sizing: border-box; font-family: 'Poppins', 'DejaVu Sans', sans-serif; }
  /* El margen inferior es 0 para que el pie pegue al borde real de la hoja;
     este padding es el espacio libre que deja el footer fijo. */
  body { margin: 0; padding-bottom: 18mm; color: #111827; font-size: 8pt; line-height: 1.25; font-family: 'Poppins', 'DejaVu Sans', sans-serif; }
  table { width: 100%; border-collapse: collapse; }
  .masthead { margin-bottom: 2mm; }
  .brand-side { width: 48%; vertical-align: top; }
  .logo-clean { margin-bottom: 5mm; min-height: 18mm; }
  .logo-clean img { display: block; max-width: 101mm; max-height: 97px; }
  .logo-fallback-text { font-size: 18pt; font-weight: bold; color: #111827; margin-bottom: 5mm; }
  .client-section { margin-top: 4mm; }
  .client-label { font-size: 7.5pt; font-weight: bold; color: #111827; margin-bottom: 1.5mm; letter-spacing: 0.3px; }
  .client-name { font-size: 17pt; line-height: 1.1; font-weight: bold; color: #000000; }
  .meta-side { width: 52%; vertical-align: top; text-align: right; }
  .document-title { font-size: 22pt; font-weight: bold; color: #000000; letter-spacing: 0.8px; line-height: 1; margin-bottom: 2mm; white-space: nowrap; }
  .meta-table { width: 68mm; margin-left: auto; border-collapse: collapse; }
  .meta-table td { padding: 0.3mm 0; font-size: 7.6pt; line-height: 1; vertical-align: middle; }
  .meta-label { width: 25mm; color: #6b7280; text-align: left; }
  .meta-value { color: #111827; text-align: left; }
  .items { width: 100%; border-collapse: collapse; margin-bottom: 2mm; table-layout: fixed; }
  .items thead { display: table-header-group; }
  .items tr { page-break-inside: avoid; }
  .items th { background: ${colorPrimario}; color: ${colorOnPrimario}; font-size: 7pt; line-height: 1; font-weight: bold; padding: 1.8mm 1.1mm; border-right: 1.5px solid #ffffff; border-bottom: 1.5px solid #ffffff; }
  .items th:last-child { border-right: none; }
  .items td { font-size: 7.4pt; line-height: 1; padding: 1.3mm 1.1mm; word-wrap: break-word; border-right: 1.5px solid #ffffff; border-bottom: 1.5px solid #ffffff; vertical-align: middle; }
  .items td:last-child { border-right: none; }
  .items tbody tr.row-odd td { background: #ffffff; }
  .items tbody tr.row-odd td.col-money { background: #e9ecef; }
  .items tbody tr.row-even td { background: #d8dce2; }
  .items tbody tr.row-even td.col-money { background: #ced3da; }
  .col-num { width: 4%; text-align: center; }
  .col-code { width: 11%; text-align: left; font-size: 7pt; word-wrap: break-word; }
  .col-art { width: 30%; text-align: left; }
  .col-brand, .col-origin { width: 9%; text-align: center; }
  .col-qty { width: 6%; text-align: center; white-space: nowrap; }
  .col-unit { width: 8%; text-align: center; }
  .col-price, .col-subt { width: 11.5%; text-align: right; white-space: nowrap; }
  .art-name { color: #111827; font-weight: bold; font-size: 8pt; line-height: 1; }
  .totals-wrap { width: 76mm; margin-left: auto; margin-top: 2.5mm; border-collapse: collapse; page-break-inside: avoid; }
  .totals-wrap td { padding: 1.8mm 3mm; font-size: 8pt; }
  .totals-wrap .subtotal-row .label { text-align: left; color: #111827; font-weight: bold; width: 42%; }
  .totals-wrap .subtotal-row .value { text-align: right; color: #111827; font-weight: bold; width: 58%; }
  .totals-wrap .grand-total-row td { background: ${colorPrimario}; color: ${colorOnPrimario}; font-weight: bold; font-size: 10.5pt; padding: 2.5mm 3.5mm; }
  .totals-wrap .grand-total-row .label { text-align: left; letter-spacing: 0.5px; }
  .totals-wrap .grand-total-row .value { text-align: right; }
  .totals-wrap .literal-row .value { text-align: right; color: #4b5563; font-size: 7.2pt; padding-top: 0; }
  .signature-section { margin-top: 6mm; page-break-inside: avoid; }
  .signature-table { width: 100%; table-layout: fixed; }
  .signature-cell { width: 50%; text-align: center; vertical-align: bottom; padding: 0 6mm; }
  .seal-container { min-height: 18mm; }
  .stacked-seal { width: 36mm; margin: 0 auto; text-align: center; }
  .firma-overlap { width: 28mm; display: block; margin: 0 auto; }
  .sello-overlap { width: 32mm; display: block; margin: -8mm auto 0 auto; }
  .sello-only { max-width: 36mm; max-height: 20mm; display: block; margin: 0 auto; }
  .firma-only { max-width: 36mm; max-height: 20mm; display: block; margin: 0 auto; }
  .signature-line { width: 46mm; margin: 1.5mm auto 1mm auto; border-top: 1px solid #111111; }
  .signature-label { font-family: 'Poppins', 'DejaVu Sans', sans-serif; font-size: 7.5pt; line-height: 1; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.3px; }
  .page-footer { position: fixed; left: 0; right: 0; bottom: 0; }
  .footer-divider { border-top: 1px solid #d1d5db; margin-bottom: 2.5mm; width: 100%; }
  /* Va en flujo normal (no absoluto): si se superponía tapaba la fila de iconos. */
  .footer-bottom-accent { height: 2.8mm; margin: 1.2mm -12mm 0 -12mm; background: ${colorPrimario}; }
  .page-footer table { width: 100%; table-layout: fixed; }
  .page-footer td { vertical-align: middle; }
  .footer-icon { width: 2.8mm; height: 2.8mm; vertical-align: -0.9mm; margin-right: 0.8mm; }
  .footer-text { font-size: 7.3pt; line-height: 1.25; color: #8c8c8c; vertical-align: baseline; }
  .footer-left { width: 30%; text-align: left; white-space: nowrap; padding: 0; }
  .footer-center { width: 30%; text-align: center; white-space: nowrap; padding: 0; }
  .footer-right { width: 40%; text-align: right; white-space: nowrap; padding: 0; }
</style>
</head>
<body>

<div class="page-footer">
  <div class="footer-divider"></div>
  <table>
    <tr>
      <td class="footer-left">
        ${business.redes_sociales ? `${iconImg(images.facebook, 'Facebook')}${iconImg(images.tiktok, 'TikTok')}${iconImg(images.instagram, 'Instagram')}${iconImg(images.linkedin, 'LinkedIn')}<span class="footer-text">${escapeHtml(business.redes_sociales)}</span>` : ''}
      </td>
      <td class="footer-center">
        ${business.website ? `${iconImg(images.web, 'Web')}<span class="footer-text">${escapeHtml(business.website)}</span>` : ''}
      </td>
      <td class="footer-right">
        ${direccion ? `${iconImg(images.map, 'Ubicación')}<span class="footer-text">${escapeHtml(direccion)}</span>` : ''}
      </td>
    </tr>
  </table>
  <div class="footer-bottom-accent"></div>
</div>

<table class="masthead">
  <tr>
    <td class="brand-side">
      <div class="logo-clean">
        ${
          images.logo
            ? `<img src="${images.logo}" alt="${escapeHtml(business.nombre)}">`
            : `<div class="logo-fallback-text">${escapeHtml(business.nombre)}</div>`
        }
      </div>
      <div class="client-section">
        <div class="client-label">NOTA DE ENTREGA PARA:</div>
        <div class="client-name">${escapeHtml(clientName)}</div>
      </div>
    </td>
    <td class="meta-side">
      <div class="document-title">NOTA DE ENTREGA</div>
      <table class="meta-table">
        <tr><td class="meta-label">Nota de entrega No:</td><td class="meta-value">${sale.id}</td></tr>
        ${branchName ? `<tr><td class="meta-label">Sucursal:</td><td class="meta-value">${escapeHtml(branchName)}</td></tr>` : ''}
        <tr><td class="meta-label">Fecha:</td><td class="meta-value">${fmtFecha(sale.createdAt)} ${fmtHora(sale.createdAt)}</td></tr>
        ${business.nit ? `<tr><td class="meta-label">NIT:</td><td class="meta-value">${escapeHtml(business.nit)}</td></tr>` : ''}
        ${business.email ? `<tr><td class="meta-label">Correo:</td><td class="meta-value">${escapeHtml(business.email)}</td></tr>` : ''}
        ${business.telefono ? `<tr><td class="meta-label">Cel:</td><td class="meta-value">${escapeHtml(business.telefono)}</td></tr>` : ''}
        <tr><td class="meta-label">Asesor:</td><td class="meta-value">${escapeHtml(sale.sellerName.toUpperCase())}</td></tr>
      </table>
    </td>
  </tr>
</table>

<table class="items">
  <thead>
    <tr>
      <th class="col-num">N°</th>
      <th class="col-code">Código interno</th>
      <th class="col-art">Artículo</th>
      <th class="col-brand">Marca</th>
      <th class="col-origin">Procedencia</th>
      <th class="col-qty">Cant.</th>
      <th class="col-unit">Unidad</th>
      <th class="col-price">Precio unitario</th>
      <th class="col-subt">Subtotal</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<table class="totals-wrap">
  <tr class="subtotal-row">
    <td class="label">Sub total:</td>
    <td class="value">${escapeHtml(moneda)} ${fmtMoney(sale.total)}</td>
  </tr>
  <tr class="grand-total-row">
    <td class="label">TOTAL</td>
    <td class="value">${escapeHtml(moneda)} ${fmtMoney(sale.total)}</td>
  </tr>
  <tr class="literal-row">
    <td class="value" colspan="2">Son: ${escapeHtml(literal)}</td>
  </tr>
</table>

<div class="signature-section">
  <table class="signature-table">
    <tr>
      <td class="signature-cell">
        ${sealImages}
        <div class="signature-line"></div>
        <div class="signature-label">Entregué conforme</div>
      </td>
      <td class="signature-cell">
        <div class="seal-container"></div>
        <div class="signature-line"></div>
        <div class="signature-label">Recibí conforme</div>
      </td>
    </tr>
  </table>
</div>

</body>
</html>`;
}
