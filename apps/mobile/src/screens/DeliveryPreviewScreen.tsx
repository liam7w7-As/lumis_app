import { useCallback } from 'react';
import { DocumentPreviewScreen, type DocumentSource } from '../components/DocumentPreviewScreen';
import { api, mediaUrl } from '../lib/api';
import { documentBusiness } from '../lib/documentBusiness';
import { loadDocFonts, loadDocImages } from '../lib/docAssets';
import { buildDeliveryNoteHtml } from '../lib/deliveryDocument';

export function DeliveryPreviewScreen({ saleId, documentType = 'delivery' }: {
  saleId: number; documentType?: 'sale' | 'delivery';
}) {
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    if (!Number.isSafeInteger(saleId) || saleId <= 0) throw new Error('Venta no encontrada.');
    const [{ sale }, { business }, fonts] = await Promise.all([
      api.saleDetail(saleId, token), api.business(token), loadDocFonts(),
    ]);
    const images = await loadDocImages({
      token, includeSeal: sale.includeSello,
      logoUrl: mediaUrl(business?.logo_url ?? null), selloUrl: mediaUrl(business?.sello_url ?? null),
    });
    return {
      html: buildDeliveryNoteHtml({ documentType, sale, business: documentBusiness(business), branchName: sale.branchName, images, fonts }),
      fileName: 'nota-' + (documentType === 'sale' ? 'venta' : 'entrega') + '-' + sale.id + '.pdf',
      title: (documentType === 'sale' ? 'Nota de venta #' : 'Nota de entrega #') + sale.id,
      warnings: images.warnings,
    };
  }, [saleId, documentType]);
  return <DocumentPreviewScreen key={documentType + ':' + saleId} loadDocument={loadDocument} />;
}
