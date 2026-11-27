import { useCallback } from 'react';
import { DocumentPreviewScreen, type DocumentSource } from '../components/DocumentPreviewScreen';
import { novaled } from '../lib/novaled';
import { downloadNovaledPdf } from '../lib/pdfFile';
import { api } from '../lib/api';
import { documentFileName } from '../lib/documentFileName';
export function NovaledSalePreviewScreen({ saleId, kind = 'sale', signature }: {
  saleId: number; kind?: 'sale' | 'delivery' | 'payment-proof'; signature?: { mode: 'asesor' | 'otro' | 'sin_nombre'; name: string };
}) {
  const mode = signature?.mode; const name = signature?.name ?? '';
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    if (kind === 'delivery') {
      const { sale } = await api.saleDetail(saleId, token);
      const note = sale.deliverySnapshot;
      if (!note) throw Error('No se pudieron obtener los datos de la nota de entrega. Vuelve a abrir el documento o actualiza la API.');
      const document = { ...note, id: note.id ?? sale.id };
      const fileName = documentFileName('delivery', document);
      return { pdf: await downloadNovaledPdf(kind, saleId, fileName, token, mode ? { mode, name } : undefined),
        fileName, title: 'Nota de entrega #' + (document.number ?? document.id), warnings: [] };
    }
    const { data: sale } = await novaled.sale(saleId,token);
    const document = kind === 'payment-proof' ? sale.paymentProof : sale;
    if (!document) throw Error('Este documento todavía no está disponible.');
    const title = { sale: 'Venta', delivery: 'Nota de entrega', 'payment-proof': 'Comprobante de pago' }[kind] + ' #' + document.number;
    const fileName = kind === 'payment-proof' ? kind + '-' + document.number + '.pdf'
      : documentFileName(kind, sale);
    return { pdf: await downloadNovaledPdf(kind,saleId,fileName,token,mode ? { mode,name } : undefined), fileName,title,warnings: [] };
  }, [saleId,kind,mode,name]);
  return <DocumentPreviewScreen key={'novaled-' + kind + ':' + saleId + ':' + mode + ':' + name} loadDocument={loadDocument} />;
}
