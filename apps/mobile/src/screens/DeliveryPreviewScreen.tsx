import { useCallback, useState } from 'react';
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

export function DeliveryPreviewScreen({ saleId, documentType = 'delivery' }: {
  saleId: number; documentType?: 'sale' | 'delivery';
}) {
  const { colors } = useTheme();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [mode, setMode] = useState<'asesor' | 'otro' | 'sin_nombre'>('asesor');
  const [name, setName] = useState('');
  const [signature, setSignature] = useState<{ mode: 'asesor' | 'otro' | 'sin_nombre'; name: string }>({ mode: 'asesor', name: '' });
  const [optionError, setOptionError] = useState<string | null>(null);
  const loadDocument = useCallback(async (token: string): Promise<DocumentSource> => {
    if (!Number.isSafeInteger(saleId) || saleId <= 0) throw new Error('Venta no encontrada.');
    if (IS_NOVALED) {
      const { sale } = await api.saleDetail(saleId, token);
      const kind = documentType === 'sale' ? 'sale' : 'delivery';
      const fileName = kind + '-' + (sale.number ?? sale.id) + '.pdf';
      return { pdf: await downloadNovaledPdf(kind, saleId, fileName, token, kind === 'delivery' ? signature : undefined), fileName, title: (kind === 'sale' ? 'Venta #' : 'Nota de entrega de venta #') + (sale.number ?? sale.id), warnings: [] };
    }
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
  }, [saleId, documentType, signature]);
  const canChooseSignature = IS_NOVALED && documentType === 'delivery';
  return <><DocumentPreviewScreen key={documentType + ':' + saleId} loadDocument={loadDocument} headerAction={canChooseSignature ?
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
