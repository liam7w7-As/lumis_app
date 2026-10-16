import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '../theme/ThemeContext';
import { loadPdfViewerAssets } from '../lib/pdfViewerAssets';
import { buildPdfViewerHtml } from '../lib/pdfViewerHtml';
import type { PreparedPdf } from '../lib/pdfFile';

export function PdfViewer({ pdf, onError }: { pdf: PreparedPdf; onError: (message: string) => void }) {
  const { colors, dark } = useTheme();
  const web = useRef<WebView>(null);
  const [source, setSource] = useState<{ html: string } | null>(null);
  const [rendered, setRendered] = useState(false);
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => {
    let active = true;
    void loadPdfViewerAssets().then((assets) => {
      if (active) { setRendered(false); setSource({ html: buildPdfViewerHtml(assets, dark) }); }
    }).catch(() => { if (active) onErrorRef.current('No se pudieron cargar los archivos del visor. Revisa la conexión con Expo e inténtalo de nuevo.'); });
    return () => { active = false; };
  }, [dark]);

  useEffect(() => {
    if (rendered) return;
    const timer = setTimeout(() => onErrorRef.current('El visor está tardando demasiado. Reintenta abrir el PDF.'), 45000);
    return () => clearTimeout(timer);
  }, [source, rendered]);

  const fail = () => onErrorRef.current('No se pudo mostrar el PDF. Reintenta abrir el visor.');
  const message = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        web.current?.postMessage(JSON.stringify({ type: 'open', id: pdf.uri, base64: pdf.base64 }));
      } else if (data.type === 'rendered' && data.id === pdf.uri) {
        setRendered(true);
      } else if (data.type === 'error') {
        if (__DEV__) console.warn('PDF.js:', data.message);
        fail();
      }
    } catch { /* Se ignoran mensajes que no pertenecen al protocolo del visor. */ }
  };
  return <View style={styles.root}>
    {source && <WebView ref={web} source={source} onMessage={message}
      originWhitelist={['*']} javaScriptEnabled domStorageEnabled={false}
      allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url.startsWith('data:text/html')}
      onError={fail} onContentProcessDidTerminate={fail} onRenderProcessGone={fail}
      webviewDebuggingEnabled={__DEV__} forceDarkOn={false} setDisplayZoomControls={false}
      style={{ backgroundColor: colors.background }} />}
    {!rendered && <View pointerEvents="none" style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.hint, { color: colors.muted }]}>Abriendo el PDF…</Text>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { fontFamily: 'Poppins', fontSize: 13 },
});
