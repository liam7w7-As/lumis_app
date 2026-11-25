import type { QuoteDetail } from './api';
import type { DocFonts, DocImages } from './docAssets';
import { buildCommercialDocument } from './commercialDocument';
import type { PdfFooterPreferences } from './documentFooter';

export interface DocBusiness extends PdfFooterPreferences {
  pdf_mostrar_marca?: boolean;
  pdf_mostrar_procedencia?: boolean;
  nombre: string;
  color_primario: string;
  moneda: string;
  terminos_default: string | null;
  redes_sociales: string | null;
  website: string | null;
  direccion: string | null;
  ciudad: string | null;
  nit: string | null;
  email: string | null;
  telefono: string | null;
}

export function buildQuoteHtml(input: { quote: QuoteDetail; business: DocBusiness; branchName: string | null; images: DocImages; fonts: DocFonts }): string {
  return buildCommercialDocument({ ...input, kind: 'quote', document: input.quote });
}
