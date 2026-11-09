import { useCallback } from 'react';
import { DocumentPreviewScreen, type DocumentSource } from '../components/DocumentPreviewScreen';
import { novaled } from '../lib/novaled';
import { downloadNovaledPdf } from '../lib/pdfFile';
export function NovaledSalePreviewScreen({ saleId, kind = 'sale', signature }: {
  saleId: number; kind?: 'sale' | 'delivery' | 'payment-proof'; signature?: { mode: 'asesor' | 'otro' | 'sin_nombre'; name: string };
}) {
  const mode = signature?.mode; const name = signature?.name ?? '';
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    const { data: sale } = await novaled.sale(saleId,token);
    const document = kind === 'delivery' ? sale.delivery : kind === 'payment-proof' ? sale.paymentProof : sale;
    if (!document) throw Error('Este documento todavía no está disponible.');
    const title = { sale: 'Venta', delivery: 'Nota de entrega', 'payment-proof': 'Comprobante de pago' }[kind] + ' #' + document.number;
    const fileName = kind + '-' + document.number + '.pdf';
    return { pdf: await downloadNovaledPdf(kind,saleId,fileName,token,mode ? { mode,name } : undefined), fileName,title,warnings: [] };
  }, [saleId,kind,mode,name]);
  return <DocumentPreviewScreen key={'novaled-' + kind + ':' + saleId + ':' + mode + ':' + name} loadDocument={loadDocument} />;
}
