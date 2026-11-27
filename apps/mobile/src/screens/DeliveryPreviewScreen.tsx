import { useCallback, useState } from 'react';
import { router,useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FormModal } from '../components/FormModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { useTheme } from '../theme/ThemeContext';
import { DocumentPreviewScreen, type DocumentSource } from '../components/DocumentPreviewScreen';
import { api, mediaUrl } from '../lib/api';
import { documentBusiness } from '../lib/documentBusiness';
import { loadDocFonts, loadDocImages } from '../lib/docAssets';
import { buildDeliveryNoteHtml } from '../lib/deliveryDocument';
import { IS_NOVALED } from '../lib/backend';
import { downloadNovaledPdf } from '../lib/pdfFile';
import { getOfflineGateway } from '../offline/bridge';
import { documentFileName } from '../lib/documentFileName';
import { DeliverySignatureOptions, type DeliverySignature } from '../components/DeliverySignatureOptions';
import { PdfPaymentOption } from '../components/PdfPaymentOption';
import { canShowSalePaymentSummary } from '../lib/salePaymentSummary';

export function DeliveryPreviewScreen({ saleId, documentType = 'delivery' }: {
  saleId: number; documentType?: 'sale' | 'delivery';
}) {
  const { colors } = useTheme();
  const {created, signature: routeMode, name: routeName, mostrar_pagos}=useLocalSearchParams<{
    created?:string; signature?:string; name?:string; mostrar_pagos?:string;
  }>();
  const initialSignature: DeliverySignature = {
    mode: routeMode === 'otro' || routeMode === 'sin_nombre' ? routeMode : 'asesor',
    name: (routeName ?? '').trim().slice(0, 150),
  };
  const suppliedSignature = ['asesor', 'otro', 'sin_nombre'].includes(routeMode ?? '')
    && (initialSignature.mode !== 'otro' || !!initialSignature.name);
  const [signatureConfirmed, setSignatureConfirmed] = useState(documentType !== 'delivery' || suppliedSignature);
  const [optionsOpen, setOptionsOpen] = useState(documentType === 'delivery' && !suppliedSignature);
  const [draftSignature, setDraftSignature] = useState<DeliverySignature>(initialSignature);
  const [signature, setSignature] = useState<DeliverySignature>(initialSignature);
  const [showPaymentSummary, setShowPaymentSummary] = useState(mostrar_pagos === '1');
  const [draftPaymentSummary, setDraftPaymentSummary] = useState(mostrar_pagos === '1');
  const [paymentAvailable, setPaymentAvailable] = useState(false);
  const [optionError, setOptionError] = useState<string | null>(null);
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    if (!Number.isSafeInteger(saleId) || saleId <= 0) throw new Error('Venta no encontrada.');
    const { sale } = await api.saleDetail(saleId, token);
    setPaymentAvailable(canShowSalePaymentSummary(sale));
    const namedDocument = documentType === 'delivery' && sale.deliverySnapshot ? { ...sale, ...sale.deliverySnapshot } : sale;
    const fileName = documentFileName(documentType, namedDocument);
    const offline = getOfflineGateway()?.status();
    if (IS_NOVALED && saleId < 1e12 && offline?.online !== false && !offline?.pending) {
      if (documentType === 'delivery' && !sale.deliverySnapshot)
        throw new Error('No se pudieron obtener los datos de la nota de entrega. Vuelve a abrir el documento o actualiza la API.');
      try {
        return { pdf: await downloadNovaledPdf(documentType, saleId, fileName, token, documentType === 'delivery' ? signature : { showPaymentSummary }), fileName, title: (documentType === 'sale' ? 'Nota de venta #' : 'Nota de entrega #') + (namedDocument.number ?? namedDocument.id), warnings: [] };
      } catch (error) {
        if (!/network request failed|failed to fetch|networkerror|tardó demasiado/i.test(String(error))) throw error;
      }
    }
    const [{ business }, fonts] = await Promise.all([
      api.business(token), loadDocFonts(),
    ]);
    const images = await loadDocImages({
      token, includeSeal: sale.includeSello,
      logoUrl: mediaUrl(business?.logo_url ?? null), selloUrl: mediaUrl(business?.sello_url ?? null),
    });
    // The delivery keeps its own issued lines, client and number. Payment and
    // printing options belong to its source sale, matching the server PDF.
    const localSale = documentType === 'delivery' && sale.deliverySnapshot ? {
      ...sale, ...sale.deliverySnapshot,
      total: sale.total, totalPagado: sale.totalPagado, initialPayment: sale.initialPayment,
      estadoPago: sale.estadoPago, estado: sale.estado, metodoPago: sale.metodoPago, payments: sale.payments,
      includeSello: sale.includeSello, includeSignature: sale.includeSignature, showNotes: sale.showNotes, notes: sale.notes,
    } : sale;
    return {
      html: buildDeliveryNoteHtml({ documentType, sale: localSale, business: documentBusiness(business), branchName: localSale.branchName, images, fonts, deliverySignature: signature, showPaymentSummary }),
      fileName,
      title: (documentType === 'sale' ? 'Nota de venta #' : 'Nota de entrega #') + (localSale.number ?? localSale.id),
      warnings: images.warnings,
    };
  }, [saleId, documentType, signature, showPaymentSummary]);
  const canChooseSignature = documentType === 'delivery';
  const openOptions = () => {
    setDraftSignature(signature); setDraftPaymentSummary(showPaymentSummary);
    setOptionError(null); setOptionsOpen(true);
  };
  const closeOptions = () => { if (!signatureConfirmed) router.back(); else setOptionsOpen(false); };
  return <>{signatureConfirmed ? <DocumentPreviewScreen key={documentType + ':' + saleId} loadDocument={loadDocument} onBack={created==='1'?()=>router.replace(`/pos/${saleId}`):undefined} headerAction={canChooseSignature || paymentAvailable ?
    <Pressable accessibilityLabel={canChooseSignature ? 'Nombre en firma de entrega' : 'Opciones de pagos en el PDF'} hitSlop={10} onPress={openOptions}><Ionicons name="options-outline" size={23} color={colors.text} /></Pressable> : undefined} /> : null}
    {!signatureConfirmed && <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>Nota de entrega</Text>
    </View>}
    <FormModal visible={optionsOpen} title={canChooseSignature ? 'Opciones de entrega' : 'Opciones de venta'} icon="create-outline" onClose={closeOptions}>
      {canChooseSignature ? <DeliverySignatureOptions value={draftSignature} error={optionError}
        onChange={value => { setDraftSignature(value); setOptionError(null); }} />
        : <PdfPaymentOption checked={draftPaymentSummary} onChange={setDraftPaymentSummary} />}
      <View><PrimaryButton title="Aplicar" onPress={() => {
        if (canChooseSignature && draftSignature.mode === 'otro' && !draftSignature.name.trim()) {
          setOptionError('Escribe el nombre para la firma.'); return;
        }
        if (canChooseSignature) setSignature({ ...draftSignature, name: draftSignature.name.trim() });
        else setShowPaymentSummary(draftPaymentSummary);
        setSignatureConfirmed(true); setOptionsOpen(false);
      }} /></View>
    </FormModal>
  </>;
}
