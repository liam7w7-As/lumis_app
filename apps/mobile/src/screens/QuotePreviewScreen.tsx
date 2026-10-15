import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { api, mediaUrl, type Business, type QuoteDetail } from '../lib/api';
import { contrastText, forBackground } from '../lib/brandColors';
import { formatMoney } from '../lib/format';
import { monto as montoLetras } from '../lib/numeroALetras';
import { loadDocFonts, loadDocImages, type DocFonts, type DocImages } from '../lib/docAssets';
import { buildQuoteHtml } from '../lib/quoteDocument';

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={mStyles.row}>
      <Text style={mStyles.label}>{label}</Text>
      <Text style={mStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}
const mStyles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 1 },
  label: { width: 70, fontSize: 7, fontFamily: 'Poppins', color: '#6b7280' },
  value: { flex: 1, fontSize: 7, fontFamily: 'Poppins', color: '#111827', fontWeight: '600' },
});

const DEFAULT_BUSINESS = {
  nombre: 'Mi Negocio',
  color_primario: '#5842F4',
  moneda: 'Bs.',
  terminos_default: null,
  redes_sociales: null,
  website: null,
  direccion: null,
  ciudad: null,
  nit: null,
  email: null,
  telefono: null,
};

type BusyAction = 'print' | 'download' | 'share' | null;

export function QuotePreviewScreen({ quoteId }: { quoteId: number }) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [images, setImages] = useState<DocImages | null>(null);
  const [fonts, setFonts] = useState<DocFonts | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    if (!token || !Number.isSafeInteger(quoteId) || quoteId <= 0) {
      setQuote(null);
      setError('Cotización no encontrada');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const [{ quote: data }, biz, fts] = await Promise.all([
        api.quoteDetail(quoteId, token),
        api.business(token).then((r) => r.business),
        loadDocFonts(),
      ]);
      const imgs = await loadDocImages({
        token,
        logoUrl: mediaUrl(biz?.logo_url ?? null),
        selloUrl: mediaUrl(biz?.sello_url ?? null),
      });
      if (request !== requestId.current) return;
      setQuote(data);
      setBusiness(biz);
      setImages(imgs);
      setFonts(fts);
    } catch (err) {
      if (request === requestId.current) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la vista previa');
      }
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [token, quoteId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { requestId.current += 1; };
    }, [load]),
  );

  const brand = {
    nombre: business?.nombre ?? DEFAULT_BUSINESS.nombre,
    color: forBackground(business?.color_primario ?? DEFAULT_BUSINESS.color_primario),
    moneda: business?.moneda ?? DEFAULT_BUSINESS.moneda,
  };
  const onBrand = contrastText(brand.color);

  const buildHtml = (): string => {
    if (!quote) {
      throw new Error('Sin cotización');
    }
    return buildQuoteHtml({
      quote,
      business: {
        nombre: brand.nombre,
        color_primario: business?.color_primario ?? DEFAULT_BUSINESS.color_primario,
        moneda: brand.moneda,
        terminos_default: business?.terminos_default ?? null,
        redes_sociales: business?.redes_sociales ?? null,
        website: business?.website ?? null,
        direccion: business?.direccion ?? null,
        ciudad: business?.ciudad ?? null,
        nit: business?.nit ?? null,
        email: business?.email ?? null,
        telefono: business?.telefono ?? null,
      },
      branchName: quote.branchName,
      images: images ?? {
        logo: null, firma: null, sello: null, facebook: null, tiktok: null,
        instagram: null, linkedin: null, web: null, map: null,
      },
      fonts: fonts ?? {
        regular: null, medium: null, semibold: null, bold: null,
      },
    });
  };

  const printPdf = async () => {
    if (!quote || busy || loading || error) return;
    setBusy('print');
    try {
      await Print.printAsync({ html: buildHtml() });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo imprimir');
    } finally {
      setBusy(null);
    }
  };

  // Genera el PDF y lo deja en Documentos/Cotizaciones de la app.
  // Se pide el contenido en base64 directamente de expo-print: copiar el archivo
  // temporal con File.copy() falla en Android con "Missing 'READ' permission",
  // porque el PDF vive en cache/Print y el chequeo de permisos lo rechaza.
  const preparePdfFile = async (): Promise<{
    uri: string;
    fileName: string;
    base64: string;
  }> => {
    if (!quote) {
      throw new Error('Sin cotización');
    }
    const { base64 } = await Print.printToFileAsync({ html: buildHtml(), base64: true });
    if (!base64) {
      throw new Error('No se pudo generar el PDF');
    }
    const fileName = `cotizacion-${quote.id}.pdf`;
    const dir = new Directory(Paths.document, 'Cotizaciones');
    if (!dir.exists) {
      dir.create({ intermediates: true });
    }
    const dest = new File(dir, fileName);
    dest.create({ overwrite: true, intermediates: true });
    dest.write(base64, { encoding: 'base64' });
    const shareUri = dest.uri.startsWith('file://') ? dest.uri : `file://${dest.uri}`;
    return { uri: shareUri, fileName, base64 };
  };

  const downloadPdf = async () => {
    if (!quote) return;
    setBusy('download');
    try {
      const { uri } = await preparePdfFile();
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Error', 'Compartir no está disponible en este dispositivo');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Cotización #${quote.id}`,
      });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo descargar');
    } finally {
      setBusy(null);
    }
  };

  const sharePdf = async () => {
    if (!quote) return;
    setBusy('share');
    try {
      const { uri } = await preparePdfFile();
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        throw new Error('Compartir no disponible en este dispositivo');
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Cotización #${quote.id}`,
      });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo compartir');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Vista previa</Text>
        <Pressable onPress={printPdf} hitSlop={10} disabled={busy !== null || loading || !quote || !!error}>
          {busy === 'print' ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Ionicons name="print-outline" size={24} color={colors.text} />
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error || !quote ? (
        <View style={styles.center}>
          <Text style={{ color: colors.error, textAlign: 'center' }}>{error ?? 'Cotización no encontrada'}</Text>
          <Pressable onPress={() => void load()} accessibilityRole="button" style={{ padding: 16 }}>
            <Text style={{ color: colors.primary }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        >
          {/* ── Hoja del documento ── */}
          <View style={styles.paper}>

            {/* MASTHEAD: logo/negocio izq | título/meta derecha */}
            <View style={styles.masthead}>
              <View style={styles.brandSide}>
                <View>{images?.logo ? <Image source={{ uri: images.logo }} resizeMode="contain" style={{ width: 160, height: 65, backgroundColor: "#fff" }} /> : <Text style={styles.logoText}>{brand.nombre}</Text>}</View>
                <View style={styles.clientSection}>
                  <Text style={styles.clientLabel}>COTIZACIÓN PARA:</Text>
                  <Text style={styles.clientName} numberOfLines={2}>
                    {quote.client?.name ?? 'Sin Cliente'}
                  </Text>
                  {quote.fechaVencimiento && (
                    <Text style={styles.clientDetail}>
                      Válida hasta: {quote.fechaVencimiento}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.metaSide}>
                <Text style={[styles.docTitle, { color: brand.color }]}>COTIZACIÓN</Text>
                <View style={styles.metaTable}>
                  <MetaRow label="No:" value={String(quote.id)} />
                  <MetaRow label="Versión:" value={String(quote.versionNumero)} />
                  {quote.branchName && <MetaRow label="Sucursal:" value={quote.branchName} />}
                  <MetaRow label="Fecha:" value={fmtFecha(quote.createdAt)} />
                  {business?.nit && <MetaRow label="NIT:" value={business.nit} />}
                  {business?.email && <MetaRow label="Correo:" value={business.email} />}
                  {business?.telefono && <MetaRow label="Cel:" value={business.telefono} />}
                  <MetaRow label="Asesor:" value={quote.sellerName.toUpperCase()} />
                </View>
              </View>
            </View>

            {/* Divisor */}
            <View style={[styles.divider, { backgroundColor: brand.color }]} />

            {/* ── Tabla de ítems ── */}
            <View style={[styles.tableHead, { backgroundColor: brand.color }]}>
              <Text style={[styles.th, styles.colN, { color: onBrand }]}>N°</Text>
              <Text style={[styles.th, styles.colCode, { color: onBrand }]}>Código</Text>
              <Text style={[styles.th, styles.colDesc, { color: onBrand }]}>Artículo</Text>
              <Text style={[styles.th, styles.colBrand, { color: onBrand }]}>Marca</Text>
              <Text style={[styles.th, styles.colQty, { color: onBrand }]}>Cant.</Text>
              <Text style={[styles.th, styles.colUnit, { color: onBrand }]}>Unidad</Text>
              <Text style={[styles.th, styles.colPrice, { color: onBrand }]}>P.Unit.</Text>
              <Text style={[styles.th, styles.colSub, { color: onBrand }]}>Subtotal</Text>
            </View>

            {quote.items.map((it, i) => (
              <View
                key={it.id}
                style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? '#ffffff' : '#e9ecef' }]}
              >
                <Text style={[styles.td, styles.colN]}>{i + 1}</Text>
                <Text style={[styles.td, styles.colCode, styles.tdSmall]} numberOfLines={2}>
                  {it.codigoInterno ?? '-'}
                </Text>
                <Text style={[styles.td, styles.colDesc, styles.tdBold]} numberOfLines={3}>
                  {it.description}
                </Text>
                <Text style={[styles.td, styles.colBrand, styles.tdSmall]} numberOfLines={2}>
                  {it.marca ?? '-'}
                </Text>
                <Text style={[styles.td, styles.colQty]}>{fmtQty(it.quantity)}</Text>
                <Text style={[styles.td, styles.colUnit, styles.tdSmall]} numberOfLines={1}>
                  {it.unit || 'Unid.'}
                </Text>
                <Text style={[styles.td, styles.colPrice, styles.tdSmall]}>
                  {formatMoney(it.unitPrice, brand.moneda)}
                </Text>
                <Text style={[styles.td, styles.colSub, styles.tdBold]}>
                  {formatMoney(it.subtotal, brand.moneda)}
                </Text>
              </View>
            ))}

            {/* ── Totales ── */}
            <View style={styles.totalsWrap}>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Sub total:</Text>
                <Text style={styles.subtotalValue}>{formatMoney(quote.total, brand.moneda)}</Text>
              </View>
              <View style={[styles.totalBar, { backgroundColor: brand.color }]}>
                <Text style={[styles.totalLabel, { color: onBrand }]}>TOTAL</Text>
                <Text style={[styles.totalValue, { color: onBrand }]}>
                  {formatMoney(quote.total, brand.moneda)}
                </Text>
              </View>
              <Text style={styles.literal}>
                Son: {montoLetras(quote.total)} {brand.moneda}
                {brand.moneda.endsWith('.') ? '' : '.'}
              </Text>
            </View>

            {/* ── Firma / sello ── */}
            {quote.includeSignature && (
              <View style={styles.signBlock}>
                {quote.includeSeal && (
                  <View style={[styles.seal, { borderColor: brand.color }]}>
                    <Text style={[styles.sealBrand, { color: brand.color }]}>
                      {brand.nombre.toLowerCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.signLine} />
                <Text style={styles.signName}>{brand.nombre.toUpperCase()}</Text>
              </View>
            )}

            {/* ── Notas ── */}
            {quote.showNotes && quote.notes && (
              <View style={styles.notesBox}>
                <Text style={styles.notesTitle}>Notas adicionales</Text>
                <Text style={styles.notesText}>{quote.notes}</Text>
              </View>
            )}

            {/* Acento inferior del color de marca */}
            <View style={[styles.footerAccent, { backgroundColor: brand.color }]} />
          </View>

          {/* ── Botones de acción ── */}
          <View style={styles.actions}>
            <View style={styles.actionCol}>
              <Pressable
                style={[styles.actionCircle, { backgroundColor: colors.surface }]}
                onPress={downloadPdf}
                disabled={busy !== null}
              >
                {busy === 'download' ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Ionicons name="download-outline" size={26} color={colors.text} />
                )}
              </Pressable>
              <Text style={[styles.actionLabel, { color: colors.muted }]}>Descargar</Text>
            </View>
            <View style={styles.actionCol}>
              <Pressable
                style={[styles.actionCircle, { backgroundColor: colors.surface }]}
                onPress={sharePdf}
                disabled={busy !== null}
              >
                {busy === 'share' ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Ionicons name="share-social-outline" size={26} color={colors.text} />
                )}
              </Pressable>
              <Text style={[styles.actionLabel, { color: colors.muted }]}>Compartir</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontFamily: 'Poppins', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 10, gap: 14 },

  // ── Paper ──
  paper: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },

  // ── Masthead ──
  masthead: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'flex-start',
  },
  brandSide: { flex: 5 },
  logoText: { fontSize: 14, fontFamily: 'Poppins', fontWeight: '700', color: '#111827' },
  clientSection: { marginTop: 8 },
  clientLabel: {
    fontSize: 7,
    fontFamily: 'Poppins',
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  clientName: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
    color: '#000000',
    lineHeight: 17,
  },
  clientDetail: { fontSize: 7, fontFamily: 'Poppins', color: '#6b7280', marginTop: 2 },
  metaSide: { flex: 4, alignItems: 'flex-end' },
  docTitle: {
    fontSize: 19,
    fontFamily: 'Poppins',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metaTable: { marginTop: 4, alignItems: 'flex-end', width: '100%' },

  divider: { height: 2 },

  // ── Tabla ──
  tableHead: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: { fontSize: 7, fontFamily: 'Poppins', fontWeight: '700' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  td: { fontSize: 8, fontFamily: 'Poppins', color: '#14142b' },
  tdBold: { fontWeight: '600' },
  tdSmall: { fontSize: 7 },

  // Columnas tabla
  colN: { width: 16, textAlign: 'center' },
  colCode: { width: 40 },
  colDesc: { flex: 1, paddingRight: 2 },
  colBrand: { width: 34, textAlign: 'center' },
  colQty: { width: 24, textAlign: 'center' },
  colUnit: { width: 32, textAlign: 'center' },
  colPrice: { width: 48, textAlign: 'right' },
  colSub: { width: 50, textAlign: 'right' },

  // ── Totales ──
  totalsWrap: { paddingHorizontal: 8, paddingBottom: 10 },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  subtotalLabel: { fontSize: 9, fontFamily: 'Poppins', fontWeight: '700', color: '#111827' },
  subtotalValue: {
    fontSize: 9,
    fontFamily: 'Poppins',
    fontWeight: '700',
    color: '#111827',
    minWidth: 68,
    textAlign: 'right',
  },
  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  totalLabel: { fontSize: 11, fontFamily: 'Poppins', fontWeight: '700', letterSpacing: 0.4 },
  totalValue: { fontSize: 13, fontFamily: 'Poppins', fontWeight: '700' },
  literal: {
    fontSize: 7,
    fontFamily: 'Poppins',
    color: '#4b5563',
    textAlign: 'right',
    marginTop: 4,
    paddingRight: 4,
  },

  // ── Firma ──
  signBlock: { alignItems: 'center', marginVertical: 14 },
  seal: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sealBrand: { fontSize: 10, fontFamily: 'Poppins', fontWeight: '700' },
  signLine: { width: 110, borderTopWidth: 1, borderTopColor: '#111111' },
  signName: {
    fontSize: 8,
    fontFamily: 'Poppins',
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.4,
    marginTop: 4,
    textTransform: 'uppercase',
  },

  // ── Notas ──
  notesBox: {
    backgroundColor: '#f6f7fc',
    borderRadius: 6,
    padding: 8,
    marginHorizontal: 8,
    marginBottom: 10,
  },
  notesTitle: { fontSize: 8, fontFamily: 'Poppins', color: '#707070', fontWeight: '600' },
  notesText: { fontSize: 8, fontFamily: 'Poppins', color: '#14142b', marginTop: 2 },

  // ── Footer acento ──
  footerAccent: { height: 5 },

  // ── Acciones ──
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 6 },
  actionCol: { alignItems: 'center', gap: 6 },
  actionCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  actionLabel: { fontSize: 13, fontFamily: 'Poppins' },
});

