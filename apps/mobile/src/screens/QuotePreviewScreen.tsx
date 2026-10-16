import { useCallback } from 'react';
import { DocumentPreviewScreen, type DocumentSource } from '../components/DocumentPreviewScreen';
import { api, mediaUrl } from '../lib/api';
import { documentBusiness } from '../lib/documentBusiness';
import { loadDocFonts, loadDocImages } from '../lib/docAssets';
import { buildQuoteHtml } from '../lib/quoteDocument';

export function QuotePreviewScreen({ quoteId }: { quoteId: number }) {
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    if (!Number.isSafeInteger(quoteId) || quoteId <= 0) throw new Error('Cotización no encontrada.');
    const [{ quote }, { business }, fonts] = await Promise.all([
      api.quoteDetail(quoteId, token), api.business(token), loadDocFonts(),
    ]);
    const images = await loadDocImages({
      token, includeSeal: quote.includeSeal && quote.includeSignature,
      logoUrl: mediaUrl(business?.logo_url ?? null), selloUrl: mediaUrl(business?.sello_url ?? null),
    });
    return {
      html: buildQuoteHtml({ quote, business: documentBusiness(business), branchName: quote.branchName, images, fonts }),
      fileName: 'cotizacion-' + quote.id + '.pdf',
      title: 'Cotización #' + quote.id,
      warnings: images.warnings,
    };
  }, [quoteId]);
  return <DocumentPreviewScreen key={'quote:' + quoteId} loadDocument={loadDocument} />;
}
