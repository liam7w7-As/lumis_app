import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { generatePdfFile, assertPdfAvailable, type PreparedPdf } from '../lib/pdfFile';
import { feedback } from '../lib/feedback';
import { NoticeCard } from './NoticeCard';
import { PdfViewer } from './PdfViewer';

export interface DocumentSource { html: string; fileName: string; title: string; warnings: string[] }
type Action = 'print' | 'download' | 'share';
export function DocumentPreviewScreen({ loadDocument }: {
  loadDocument: (token: string) => Promise<DocumentSource>;
}) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [document, setDocument] = useState<{ pdf: PreparedPdf; title: string; warnings: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerRevision, setViewerRevision] = useState(0);
  const [busy, setBusy] = useState<Action | null>(null);
  const lock = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true); setError(null); setViewerError(null); setDocument(null);
    try {
      if (!token) throw new Error('Inicia sesión para abrir este documento.');
      const source = await loadDocument(token);
      if (request !== requestId.current) return;
      const pdf = await generatePdfFile(source.html, source.fileName);
      if (request !== requestId.current) return;
      setDocument({ pdf, title: source.title, warnings: source.warnings });
    } catch (err) {
      if (request !== requestId.current) return;
      const message = err instanceof Error ? err.message : 'No se pudo generar el documento.';
      setError(message);
      feedback.error('No se pudo abrir el documento', message);
    } finally { if (request === requestId.current) setLoading(false); }
  }, [token, loadDocument]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current++; };
  }, [load]));

  const action = async (kind: Action) => {
    if (!document || loading || lock.current) return;
    lock.current = true; setBusy(kind);
    try {
      assertPdfAvailable(document.pdf);
      if (kind === 'print') await Print.printAsync({ uri: document.pdf.uri });
      else {
        if (!await Sharing.isAvailableAsync()) throw new Error('Compartir no está disponible en este dispositivo.');
        await Sharing.shareAsync(document.pdf.uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: document.title });
      }
    } catch (err) {
      feedback.error(kind === 'print' ? 'No se pudo imprimir' : 'No se pudo compartir',
        err instanceof Error ? err.message : 'Inténtalo de nuevo.');
    } finally { lock.current = false; setBusy(null); }
  };
  const showViewerError = useCallback((message: string) => {
    setViewerError(message);
    feedback.error('No se pudo mostrar la vista previa', message);
  }, []);
  const disabled = !document || loading || busy !== null;
  return <View style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]}>Vista previa</Text>
      <Pressable onPress={() => { void action('print'); }} disabled={disabled} hitSlop={10} accessibilityLabel="Imprimir PDF">
        {busy === 'print' ? <ActivityIndicator color={colors.primary} /> :
          <Ionicons name="print-outline" size={24} color={disabled ? colors.muted : colors.text} />}
      </Pressable>
    </View>
    {loading ? <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.hint, { color: colors.muted }]}>Generando PDF…</Text>
    </View> : error || !document ? <View style={styles.center}>
      <View style={styles.notice}><NoticeCard tone="error" title="No se pudo abrir el documento"
        message={error ?? 'Documento no encontrado'} action="Reintentar" onPress={() => { void load(); }} /></View>
    </View> : <>
      {!!document.warnings.length && <View style={styles.warning}>
        <Text style={[styles.hint, { color: colors.muted }]}>{document.warnings.join('\n')}</Text>
        <Pressable onPress={() => { void load(); }} accessibilityRole="button" style={styles.retry}>
          <Text style={{ color: colors.primary, fontFamily: 'Poppins-SemiBold' }}>Reintentar imágenes</Text>
        </Pressable>
      </View>}
      {viewerError ? <View style={styles.center}><View style={styles.notice}>
        <NoticeCard tone="error" title="El PDF está generado, pero no se pudo mostrar" message={viewerError}
          action="Reabrir visor" onPress={() => { setViewerError(null); setViewerRevision((value) => value + 1); }} />
      </View></View> : <PdfViewer key={document.pdf.uri + ':' + viewerRevision} pdf={document.pdf} onError={showViewerError} />}
    </>}
    <View style={[styles.actions, { paddingBottom: insets.bottom + 10, borderColor: colors.border }]}>
      {(['download', 'share'] as const).map((kind) =>
        <Pressable key={kind} accessibilityRole="button" disabled={disabled}
          onPress={() => { void action(kind); }}
          style={[styles.action, { backgroundColor: colors.surface, opacity: disabled ? .5 : 1 }]}>
          {busy === kind ? <ActivityIndicator color={colors.primary} /> :
            <Ionicons name={kind === 'download' ? 'download-outline' : 'share-social-outline'} size={22} color={colors.primary} />}
          <Text style={[styles.actionText, { color: colors.text }]}>{kind === 'download' ? 'Descargar' : 'Compartir'}</Text>
        </Pressable>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontFamily: 'Poppins-SemiBold', fontSize: 19 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hint: { fontSize: 12, fontFamily: 'Poppins' },
  notice: { width: '100%', maxWidth: 480, padding: 20 },
  warning: { paddingHorizontal: 16, paddingVertical: 8 },
  retry: { minHeight: 36, justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  action: { flex: 1, minHeight: 50, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: 'Poppins-SemiBold', fontSize: 13 },
});
