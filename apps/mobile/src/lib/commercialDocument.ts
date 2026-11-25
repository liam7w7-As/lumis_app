import type { QuoteDetail, SaleDetail } from './api';
import type { DocFonts, DocImages } from './docAssets';
import type { DocBusiness } from './quoteDocument';
import { forBackground, contrastText } from './brandColors';
import { getDocumentClient, documentClientHtml } from './documentClient';
import { documentColumns } from './documentColumns';
import { buildDocumentFooter } from './documentFooter';
import { monto } from './numeroALetras';

type Kind = 'quote' | 'sale' | 'delivery';
export type CommercialInput = { business: DocBusiness; branchName: string | null; images: DocImages; fonts: DocFonts;
  deliverySignature?: { mode: 'asesor' | 'otro' | 'sin_nombre'; name: string } } &
  ({ kind: 'quote'; document: QuoteDetail } | { kind: 'sale' | 'delivery'; document: SaleDetail });
// Poppins Bold tracking fills the 42.4% right column on a Letter page (189.4mm content).
const titles: Record<Kind, { text: string; size: number; tracking: number; number: string; client: string }> = {
  quote: { text: 'COTIZACIÓN', size: 26, tracking: 6.918, number: 'Cotización No:', client: 'COTIZACIÓN PARA:' },
  sale: { text: 'NOTA DE VENTA', size: 22, tracking: 4.472, number: 'Nota No:', client: 'VENTA PARA:' },
  delivery: { text: 'NOTA DE ENTREGA', size: 20, tracking: 3.215, number: 'Nota:', client: 'PARA:' },
};
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(value) ? 0 : 2, minimumFractionDigits: Number.isInteger(value) ? 0 : 2 });
const date = (value: string) => new Date(value).toLocaleDateString('en-GB');
const time = (value: string) => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function buildCommercialDocument(input: CommercialInput): string {
  const { kind, document: doc, business, branchName, images, fonts } = input;
  const quote = kind === 'quote' ? doc as QuoteDetail : null;
  const sale = kind !== 'quote' ? doc as SaleDetail : null;
  const delivery = kind === 'delivery';
  const title = titles[kind];
  const signatureName = input.deliverySignature?.mode === 'sin_nombre' ? '' : input.deliverySignature?.mode === 'otro' ? input.deliverySignature.name.trim() : doc.sellerName;
  const rawCurrency = business.moneda || 'Bs.';
  const currency = escape(rawCurrency);
  const color = forBackground(business.color_primario || '#5842F4');
  const onColor = contrastText(color);
  const client = getDocumentClient(doc);
  const columns = documentColumns(business, doc.items);
  const showBrand = !!quote && columns.showBrand, showOrigin = !!quote && columns.showOrigin;
  const count = delivery ? 3 : quote ? columns.count : 7;
  const articleWidth = 30 + (!showBrand ? 8.5 : 0) + (!showOrigin ? 10 : 0);
  const number = doc.number ?? doc.id;
  const seal = quote ? quote.includeSeal : !!sale?.includeSello;
  const signature = !!doc.includeSignature;
  const notes = (doc.notes ?? '').trim();
  const terms = quote?.fechaVencimiento ? (quote.terminos ?? '').trim() : (quote?.terminos || business.terminos_default || '').trim();
  const validUntil = quote?.fechaVencimiento ? 'Cotización válida hasta el ' + quote.fechaVencimiento.split('-').reverse().join('/') + '.' : '';
  const finalNotes = doc.showNotes ? [notes, terms, validUntil].filter(Boolean).join('\n') : '';
  const dockNotes = !!finalNotes && doc.items.length <= 8 && doc.items.every(item => item.description.length <= 120) && finalNotes.length <= 500;
  const paid = sale?.estadoPago === 'pagado' && sale.metodoPago !== 'por_pagar' ? sale.total : (sale?.totalPagado ?? 0);
  const initial = sale?.initialPayment ?? paid;
  const balance = sale ? Math.max(0, doc.total - (delivery ? paid : initial)) : 0;
  const status = sale?.estado === 'anulada' ? 'ANULADO' : balance <= .009 ? 'PAGADO' : (delivery ? paid : initial) > 0 ? 'ABONO PARCIAL' : 'POR COBRAR';
  const tableSubtotal = Math.round(doc.items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
  const discount = Math.max(0, Math.round((tableSubtotal - doc.total) * 100) / 100);
  const meta = [
    [title.number, escape(String(number)) + (quote ? `<span class="document-version">Versión ${quote.versionNumero}</span>` : '')],
    ['Fecha:', escape(date(delivery && sale?.entregadaAt ? sale.entregadaAt : doc.createdAt) + (delivery ? '' : ' ' + time(doc.createdAt)))],
    ['Sucursal:', escape(branchName || '-')],
    ...(delivery ? [['Entrega:', sale?.estado === 'anulada' ? 'ANULADA' : sale?.entregadaAt ? 'CONFIRMADA' : 'PENDIENTE']] : [
      ...(quote || business.nit ? [['NIT:', escape(business.nit || '-')]] : []),
      ...(quote || business.email ? [['Correo:', escape(business.email || '-')]] : []),
      ...(!quote && business.telefono ? [['Cel:', escape(business.telefono)]] : []),
    ]),
  ];
  const sealHtml = !seal ? '' : images.firma && images.sello
    ? `<div class="stacked-seal"><img src="${images.firma}" class="firma-overlap" alt="Firma"><img src="${images.sello}" class="sello-overlap" alt="Sello"></div>`
    : images.sello || images.firma ? `<img src="${images.sello || images.firma}" class="sello-only" alt="Sello">` : '';
  const signatureHtml = delivery ? `<div class="signature-section"><table>
    <tr><td class="signature-cell"><div class="seal-container">${sealHtml}</div></td><td class="signature-cell"><div class="seal-container"></div></td></tr>
    <tr><td class="signature-cell"><div class="signature-line"></div></td><td class="signature-cell"><div class="signature-line"></div></td></tr>
    <tr><td class="signature-cell">Entregué conforme</td><td class="signature-cell">Recibí conforme</td></tr>
    <tr><td class="signature-cell" data-pdf-delivery-sender>${signatureName ? escape(signatureName) : ''}</td><td class="signature-cell"></td></tr>
    </table></div>` : signature || sealHtml ? `<div class="signature-section"><div class="signature-single"><div class="seal-container">${sealHtml}</div>
      ${signature ? `<div class="signature-line"></div><div>${escape(business.nombre)}</div>` : ''}</div></div>` : '';
  const rows = doc.items.map((item, i) => {
    const metadata = !quote ? [business.pdf_mostrar_marca !== false && item.marca ? 'Marca: ' + item.marca : '', business.pdf_mostrar_procedencia !== false && item.procedencia ? 'Procedencia: ' + item.procedencia : ''].filter(Boolean).join(' · ') : '';
    return `<tr class="${i % 2 ? 'row-even' : 'row-odd'}"><td class="col-num">${i + 1}</td>
      ${!delivery ? `<td class="col-code">${escape(item.codigoInterno || '-')}</td>` : ''}
      <td class="col-art"><span class="art-name">${escape(item.description)}</span>${metadata ? `<div class="art-meta">${escape(metadata)}</div>` : ''}</td>
      ${showBrand ? `<td class="col-brand">${escape(item.marca?.trim() || '-')}</td>` : ''}
      ${showOrigin ? `<td class="col-origin">${escape(item.procedencia?.trim() || '-')}</td>` : ''}
      <td class="col-qty">${quantity(item.quantity)}</td>
      ${delivery ? '' : `<td class="col-unit">${escape(item.unit || 'Unidad')}</td><td class="col-price col-money">${currency} ${money(item.unitPrice)}</td><td class="col-subt col-money">${currency} ${money(item.subtotal)}</td>`}</tr>`;
  }).join('');
  const fontFaces = (['regular', 'medium', 'semibold', 'bold'] as const).map((key, i) => fonts[key] ? `@font-face{font-family:Poppins;font-weight:${[400,500,600,700][i]};src:url("${fonts[key]}") format('truetype')}` : '').join('\n')
    + (fonts.footer ? `@font-face{font-family:Prompt;font-weight:400;src:url("${fonts.footer}") format('truetype')}` : '');
  // The outer repeating tfoot reserves footer space on every printed page, including
  // pages containing totals or signatures. Body padding only protects the last page.
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${title.text} #${number}</title><style>
${fontFaces}
@page{size:letter portrait;margin:14mm 12.5mm 0 14mm}
*{box-sizing:border-box;font-family:Poppins,'DejaVu Sans',sans-serif}
body{margin:0;color:#111;font-size:7.4pt;line-height:9pt}
table{width:100%;border-collapse:collapse}td{padding:0}
.page-frame{table-layout:fixed}.page-frame>tbody>tr>td{vertical-align:top}.page-frame>tfoot{display:table-footer-group}.page-frame>tfoot>tr>td{height:24mm;padding:0;border:0}
.masthead{margin-bottom:5mm;table-layout:fixed}.masthead td{vertical-align:top}
.brand-side{padding-right:5mm}.logo-clean{min-height:20mm}.logo-clean img{display:block;max-width:52mm;max-height:70px}.logo-fallback-text{font-size:24pt;font-weight:700;line-height:1.1}
.meta-side{text-align:left}.document-title{margin:0 0 4.5mm;font-size:${title.size}pt;line-height:30pt;font-weight:700;letter-spacing:${title.tracking}pt;white-space:nowrap}
.meta-label,.meta-value{padding:.25mm 0;font-size:7.4pt;line-height:8.8pt;overflow-wrap:anywhere}.meta-label{color:#888}.meta-value{padding-left:1.5mm}.document-version{margin-left:1.5mm;font-size:6.5pt;color:#888}
.masthead .client-adviser-row td{vertical-align:baseline}.client-label{font-size:7.4pt;line-height:9pt}.client-name{font-size:10.1pt;line-height:12pt;font-weight:600;text-transform:uppercase;overflow-wrap:anywhere}.client-name-cell{padding-bottom:1mm!important}
.items{table-layout:fixed;margin-bottom:2mm}.items thead{display:table-header-group}.items tfoot{display:table-footer-group}.items tfoot td{padding:0;border:0;height:0}.items tr{break-inside:avoid;page-break-inside:avoid}.items th{background:${color};color:${onColor};font-size:7pt;font-weight:400;line-height:9pt;padding:1.9mm 1.1mm;border-right:.8pt solid white;border-bottom:.8pt solid white}
.items td{font-size:7.4pt;line-height:9pt;padding:${quote ? '2.4' : '1.6'}mm 1.1mm;border-right:.8pt solid white;border-bottom:.8pt solid white;vertical-align:middle;overflow-wrap:anywhere}.items th:last-child,.items td:last-child{border-right:0}.row-even td{background:#e5e5e5}.row-odd td{background:white}
.col-num{width:4%;text-align:center}.col-code{width:${quote ? 11.5 : 12}%;text-align:left;font-size:6.8pt}.col-art{width:${delivery ? 84 : quote ? articleWidth : 39}%;text-align:left}.col-brand{width:8.5%;text-align:center}.col-origin{width:10%;text-align:center}.col-qty{width:${delivery ? 12 : quote ? 5.5 : 7}%;text-align:center}.col-unit{width:${quote ? 7.5 : 10}%;text-align:center}.col-price,.col-subt{width:${quote ? 11.5 : 14}%;text-align:center}.col-money{white-space:nowrap;overflow-wrap:normal!important}.art-name{font-weight:400}.art-meta{margin-top:.8mm;color:#777;font-size:6.7pt}
${dockNotes ? '.document-main{min-height:240.4mm;display:flex;flex-direction:column}.document-main>*{flex-shrink:0}.document-main>.document-closing{flex:1;display:flex;flex-direction:column}.document-closing>*{flex-shrink:0}.document-closing>.quote-notes{margin-top:auto;margin-bottom:0;padding-top:12mm}' : ''}
.document-closing{page-break-inside:${finalNotes.length <= 500 ? 'avoid' : 'auto'}}.totals-wrap{width:42.4%;margin:2mm 0 0 auto;page-break-inside:avoid}.totals-wrap td{padding:1.3mm 0;font-size:7.4pt;line-height:9.5pt}.totals-wrap .label{width:48%;text-align:left}.totals-wrap .value{width:52%;text-align:right}.grand-total-row td{background:${color};color:${onColor};font-size:10pt;font-weight:600;padding:2mm 3mm}.totals-wrap .grand-total-row .label{padding-left:3mm}.totals-wrap .grand-total-row .value{padding-right:3mm}.literal-row .value{font-size:7pt;color:#777;padding-top:1.2mm}.discount-row td{color:#666;font-size:7pt}
.sale-summary{table-layout:fixed;margin-top:2mm}.sale-summary>tbody>tr>td{vertical-align:top}.sale-payments{width:57.6%;padding-right:8mm;padding-top:1.3mm}.sale-total{width:42.4%}.sale-summary .totals-wrap{width:100%;margin-top:0}.payment-facts td{padding:0 3mm 2mm 0;font-size:7.4pt;line-height:9.5pt}.payment-label{color:#888}.payment-value{display:block;margin-top:1mm;font-size:9pt;font-weight:600;line-height:11pt}
.signature-section{margin-top:6mm;text-align:center;page-break-inside:avoid;font-size:7.5pt;line-height:9pt}.signature-single{width:48mm;margin:0 auto}.signature-cell{width:50%;text-align:center;vertical-align:bottom;padding:0 8mm}.seal-container{min-height:18mm}.signature-line{width:40mm;margin:1.5mm auto 1mm;border-top:.6pt solid #111}.stacked-seal{width:36mm;margin:auto}.firma-overlap{width:28mm;display:block;margin:auto}.sello-overlap{width:32mm;display:block;margin:-8mm auto 0}.sello-only{max-width:36mm;max-height:20mm;display:block;margin:auto}
.quote-notes{margin:12mm 0 5mm;page-break-inside:avoid}.footer-notes-title{color:#888;font-size:7.4pt;margin-bottom:.8mm}.footer-notes-content{color:#888;font-size:7.4pt;line-height:9.5pt;white-space:pre-line;overflow-wrap:anywhere}
.page-footer{position:fixed;left:0;right:0;bottom:8mm;height:12mm}.footer-divider{border-top:.6pt solid #9b9b9b;margin-bottom:4mm}.footer-bottom-accent{position:absolute;bottom:-8mm;left:-14mm;right:-12.5mm;height:2.6mm;background:${color}}
.page-footer table{table-layout:fixed}.page-footer td{vertical-align:middle;padding:0}.page-footer .footer-group{width:auto;table-layout:auto}.footer-group td{vertical-align:middle;line-height:12pt}.page-footer .footer-icon-cell{width:3.6mm;padding-right:.8mm}.footer-icon{display:block;width:2.8mm;height:2.8mm;margin:0}.footer-text{display:block;position:relative;top:-.7pt;font-family:Prompt,Poppins,sans-serif;font-size:9.5pt;line-height:12pt;color:#9b9b9b}.footer-web{margin-left:auto}
</style></head><body>
<div class="page-footer"><div class="footer-divider" data-pdf-footer-divider></div>${buildDocumentFooter(business, images, '')}<div class="footer-bottom-accent"></div></div>
<table class="page-frame"><tbody><tr><td><div class="document-main"><table class="masthead"><colgroup><col style="width:49%"><col style="width:8.6%"><col style="width:11.4%"><col style="width:31%"></colgroup>
<tr><td class="brand-side" rowspan="${meta.length}"><div class="logo-clean">${images.logo ? `<img src="${images.logo}" alt="${escape(business.nombre)}">` : `<div class="logo-fallback-text">${escape(business.nombre)}</div>`}</div></td><td></td><td class="meta-side" colspan="2"><div class="document-title" data-pdf-title>${title.text}</div></td></tr>
${meta.map(([label, value], i) => `<tr>${i === meta.length - 1 ? `<td class="client-label">${title.client}</td>` : ''}<td></td><td class="meta-label" ${i === 0 ? 'data-pdf-reference' : ''}>${label}</td><td class="meta-value">${value}</td></tr>`).join('')}
<tr class="client-adviser-row"><td class="client-name-cell"><span class="client-name" data-pdf-client-name>${escape(client.name || 'Sin Cliente')}</span></td><td></td><td class="meta-label" data-pdf-adviser>Asesor:</td><td class="meta-value" data-pdf-adviser>${escape(doc.sellerName)}</td></tr>
<tr><td>${documentClientHtml(client)}</td><td colspan="3"></td></tr></table>
<table class="items"><thead><tr><th class="col-num">N°</th>${!delivery ? '<th class="col-code">Código interno</th>' : ''}<th class="col-art">Artículo</th>${showBrand ? '<th class="col-brand">Marca</th>' : ''}${showOrigin ? '<th class="col-origin">Procedencia</th>' : ''}<th class="col-qty">Cant.</th>${delivery ? '' : '<th class="col-unit">Unidad</th><th class="col-price">Precio unitario</th><th class="col-subt">Subtotal</th>'}</tr></thead><tbody>${rows}</tbody><tfoot aria-hidden="true"><tr><td colspan="${count}"></td></tr></tfoot></table>
<div class="document-closing">
${sale && !delivery ? `<table class="sale-summary"><tbody><tr><td class="sale-payments"><table class="payment-facts"><tr><td><span class="payment-label">Abono:</span><span class="payment-value">${currency} ${money(initial)}</span></td><td><span class="payment-label">Saldo pendiente:</span><span class="payment-value">${currency} ${money(balance)}</span></td></tr><tr><td colspan="2"><span class="payment-label">Estado de pago:</span> ${status}</td></tr></table></td><td class="sale-total">` : ''}
<table class="totals-wrap" data-pdf-totals>${delivery ? `<tr class="subtotal-row"><td class="label">Estado de pago:</td><td class="value">${status}</td></tr><tr class="grand-total-row"><td class="label">Saldo pendiente:</td><td class="value">${currency} ${money(balance)}</td></tr>` : `<tr class="subtotal-row"><td class="label">Sub total:</td><td class="value">${currency} ${money(tableSubtotal)}</td></tr>${discount > .009 ? `<tr class="discount-row"><td class="label">Descuento:</td><td class="value">- ${currency} ${money(discount)}</td></tr>` : ''}<tr class="grand-total-row"><td class="label">TOTAL</td><td class="value">${currency} ${money(doc.total)}</td></tr><tr class="literal-row"><td class="value" colspan="2">Son: ${escape(monto(doc.total))} ${currency}${rawCurrency.endsWith('.') ? '' : '.'}</td></tr>`}</table>
${sale && !delivery ? '</td></tr></tbody></table>' : ''}
${signatureHtml}
${finalNotes ? `<div class="quote-notes" data-pdf-final-notes><div class="footer-notes-title">Notas adicionales</div><div class="footer-notes-content">${escape(finalNotes)}</div></div>` : ''}
</div></div></td></tr></tbody><tfoot aria-hidden="true"><tr><td></td></tr></tfoot></table></body></html>`;
}
