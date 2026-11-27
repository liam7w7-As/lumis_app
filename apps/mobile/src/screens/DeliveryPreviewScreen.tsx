import { useCallback, useState } from 'react';
import { router,useLocalSearchParams } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
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

export function DeliveryPreviewScreen({ saleId, documentType = 'delivery' }: {
  saleId: number; documentType?: 'sale' | 'delivery';
}) {
  const { colors } = useTheme();
  const {created}=useLocalSearchParams<{created?:string}>();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [mode, setMode] = useState<'asesor' | 'otro' | 'sin_nombre'>('asesor');
  const [name, setName] = useState('');
  const [signature, setSignature] = useState<{ mode: 'asesor' | 'otro' | 'sin_nombre'; name: string }>({ mode: 'asesor', name: '' });
  const [optionError, setOptionError] = useState<string | null>(null);
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    if (!Number.isSafeInteger(saleId) || saleId <= 0) throw new Error('Venta no encontrada.');
    const { sale } = await api.saleDetail(saleId, token);
    const namedDocument = documentType === 'delivery' && sale.deliverySnapshot ? { ...sale, ...sale.deliverySnapshot } : sale;
    const fileName = documentFileName(documentType, namedDocument);
    const offline = getOfflineGateway()?.status();
    if (IS_NOVALED && saleId < 1e12 && offline?.online !== false && !offline?.pending) {
      if (documentType === 'delivery' && !sale.deliverySnapshot)
        throw new Error('No se pudieron obtener los datos de la nota de entrega. Vuelve a abrir el documento o actualiza la API.');
      try {
        return { pdf: await downloadNovaledPdf(documentType, saleId, fileName, token, documentType === 'delivery' ? signature : undefined), fileName, title: (documentType === 'sale' ? 'Nota de venta #' : 'Nota de entrega #') + (namedDocument.number ?? namedDocument.id), warnings: [] };
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
      html: buildDeliveryNoteHtml({ documentType, sale: localSale, business: documentBusiness(business), branchName: localSale.branchName, images, fonts, deliverySignature: signature }),
      fileName,
      title: (documentType === 'sale' ? 'Nota de venta #' : 'Nota de entrega #') + (localSale.number ?? localSale.id),
      warnings: images.warnings,
    };
  }, [saleId, documentType, signature]);
  const canChooseSignature = documentType === 'delivery';
  return <><DocumentPreviewScreen key={documentType + ':' + saleId} loadDocument={loadDocument} onBack={created==='1'?()=>router.replace(`/pos/${saleId}`):undefined} headerAction={canChooseSignature ?
    <Pressable accessibilityLabel="Nombre en firma de entrega" hitSlop={10} onPress={() => setOptionsOpen(true)}><Ionicons name="options-outline" size={23} color={colors.text} /></Pressable> : undefined} />
    <FormModal visible={optionsOpen} title="Entregué conforme" icon="create-outline" onClose={() => setOptionsOpen(false)}>
      {(['asesor', 'otro', 'sin_nombre'] as const).map(value => <Pressable key={value} onPress={() => { setMode(value); setOptionError(null); }} style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name={mode === value ? 'radio-button-on' : 'radio-button-off'} size={23} color={mode === value ? colors.primary : colors.muted} />
        <Text style={{ fontFamily: 'Poppins', color: colors.text }}>{value === 'asesor' ? 'Nombre del asesor' : value === 'otro' ? 'Otro nombre' : 'Sin nombre'}</Text>
      </Pressable>)}
      {mode === 'otro' && <TextInput accessibilityLabel="Nombre para la firma" value={name} onChangeText={setName} maxLength={150} placeholder="Nombre para la firma" placeholderTextColor={colors.muted}
        style={{ color: colors.text, borderBottomColor: colors.border, borderBottomWidth: 1, minHeight: 46, fontFamily: 'Poppins', fontSize: 16 }} />}
      {!!optionError && <Text style={{ color: colors.error, fontFamily: 'Poppins' }}>{optionError}</Text>}
      <View><PrimaryButton title="Aplicar" onPress={() => { if (mode === 'otro' && !name.trim()) { setOptionError('Escribe el nombre para la firma.'); return; } setSignature({ mode, name: name.trim() }); setOptionsOpen(false); }} /></View>
    </FormModal>
  </>;
}
