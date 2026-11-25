import type { SaleDetail } from './api';
import type { DocFonts, DocImages } from './docAssets';
import type { DocBusiness } from './quoteDocument';
import { buildCommercialDocument } from './commercialDocument';

export function buildDeliveryNoteHtml(input: {
  documentType?: 'sale' | 'delivery';
  showPaymentSummary?: boolean;
  deliverySignature?: { mode: 'asesor' | 'otro' | 'sin_nombre'; name: string };
  sale: SaleDetail; business: DocBusiness; branchName: string | null; images: DocImages; fonts: DocFonts;
}): string {
  return buildCommercialDocument({ ...input, kind: input.documentType ?? 'delivery', document: input.sale });
}
