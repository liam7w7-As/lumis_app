import { useCallback } from 'react';
import { DocumentPreviewScreen, type DocumentSource } from '../components/DocumentPreviewScreen';
import { novaled } from '../lib/novaled';
import { downloadNovaledQuotePdf } from '../lib/pdfFile';
export function NovaledQuotePreviewScreen({ quoteId }: { quoteId: number }) {
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    const { data: quote } = await novaled.quote(quoteId, token);
    const fileName = 'cotizacion-' + quote.number + '-v' + quote.version + '.pdf';
    return { pdf: await downloadNovaledQuotePdf(quoteId, fileName, token), fileName,
      title: 'Cotización #' + quote.number + ' · V' + quote.version, warnings: [] };
  }, [quoteId]);
  return <DocumentPreviewScreen key={'novaled-quote:' + quoteId} loadDocument={loadDocument} />;
}
