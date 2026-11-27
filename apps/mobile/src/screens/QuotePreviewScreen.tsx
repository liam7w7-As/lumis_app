import { useCallback } from 'react';
import { router,useLocalSearchParams } from 'expo-router';
import { DocumentPreviewScreen, type DocumentSource } from '../components/DocumentPreviewScreen';
import { api, mediaUrl } from '../lib/api';
import { documentBusiness } from '../lib/documentBusiness';
import { loadDocFonts, loadDocImages } from '../lib/docAssets';
import { buildQuoteHtml } from '../lib/quoteDocument';
import { IS_NOVALED } from '../lib/backend';
import { downloadNovaledQuotePdf } from '../lib/pdfFile';
import { getOfflineGateway } from '../offline/bridge';
import { documentFileName } from '../lib/documentFileName';

export function QuotePreviewScreen({ quoteId }: { quoteId: number }) {
  const {created}=useLocalSearchParams<{created?:string}>();
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    if (!Number.isSafeInteger(quoteId) || quoteId <= 0) throw new Error('Cotización no encontrada.');
    const { quote } = await api.quoteDetail(quoteId, token);
    const fileName = documentFileName('quote', quote);
    const offline = getOfflineGateway()?.status();
    if (IS_NOVALED && quoteId < 1e12 && offline?.online !== false && !offline?.pending) {
      try {
        return { pdf: await downloadNovaledQuotePdf(quoteId, fileName, token), fileName, title: 'Cotización #' + (quote.number ?? quote.id), warnings: [] };
      } catch (error) {
        if (!/network request failed|failed to fetch|networkerror|tardó demasiado/i.test(String(error))) throw error;
        // A connection can disappear after the last sync: the local snapshot still renders.
      }
    }
    const [{ business }, fonts] = await Promise.all([
      api.business(token), loadDocFonts(),
    ]);
    const images = await loadDocImages({
      token, includeSeal: quote.includeSeal,
      logoUrl: mediaUrl(business?.logo_url ?? null), selloUrl: mediaUrl(business?.sello_url ?? null),
    });
    return {
      html: buildQuoteHtml({ quote, business: documentBusiness(business), branchName: quote.branchName, images, fonts }),
      fileName,
      title: 'Cotización #' + (quote.number ?? quote.id),
      warnings: images.warnings,
    };
  }, [quoteId]);
  return <DocumentPreviewScreen key={'quote:' + quoteId} loadDocument={loadDocument} onBack={created==='1'?()=>router.replace(`/quotes/${quoteId}`):undefined}/>;
}
