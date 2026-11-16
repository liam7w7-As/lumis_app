import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../lib/api';
import { pickImageFromCamera, pickImageFromLibrary, type PickedImage } from '../lib/media';
import {
  newQuoteScanId, newScanProduct, reviewScanLines, scannedQuoteItems, scanReviewError, selectScanProduct,
  type ScannedQuoteItem, type ScanReviewRow,
} from '../lib/quoteScan';
import { useMoney } from '../context/BusinessContext';
import { useTheme } from '../theme/ThemeContext';
import { FormModal } from './FormModal';
import { PrimaryButton } from './PrimaryButton';

interface MagicQuoteScanModalProps {
  visible: boolean;
  token: string;
  branchId?: number | null;
  onClose: () => void;
  onAdd: (items: ScannedQuoteItem[]) => Promise<void> | void;
}

export function MagicQuoteScanModal(props: MagicQuoteScanModalProps) {
  // Preserve a photo's request id when closing, but never share it with another account.
  return <ScanSession key={props.token} {...props} />;
}

function ScanSession({ visible, token, onClose, onAdd }: MagicQuoteScanModalProps) {
  const { colors, dark } = useTheme();
  const formatMoney = useMoney();
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [rows, setRows] = useState<ScanReviewRow[]>([]);
  const [reading, setReading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validate, setValidate] = useState(false);
  const alive = useRef(true);
  const shown = useRef(visible);
  const request = useRef(0);
  const pickerRequest = useRef(0);
  const readingLock = useRef(false);
  const pickingLock = useRef(false);
  const addingLock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current += 1; };
  }, []);
  useLayoutEffect(() => {
    shown.current = visible;
    if (!visible) {
      request.current += 1;
      pickerRequest.current += 1;
      const interrupted = readingLock.current;
      const sequence = request.current;
      readingLock.current = false; pickingLock.current = false;
      void Promise.resolve().then(() => {
        if (!alive.current || shown.current || sequence !== request.current) return;
        if (interrupted) setError('Puedes recuperar la lectura de esta foto al reintentar, sin iniciar otro escaneo.');
        setReading(false); setPicking(false);
      });
    }
  }, [visible]);
  const active = () => alive.current && shown.current;

  const close = () => {
    if (addingLock.current) return;
    request.current += 1;
    pickerRequest.current += 1;
    shown.current = false;
    if (readingLock.current) setError('Puedes recuperar la lectura de esta foto al reintentar, sin iniciar otro escaneo.');
    readingLock.current = false; pickingLock.current = false;
    setReading(false); setPicking(false);
    onClose();
  };
  const read = async (image: PickedImage, id: string) => {
    if (!active() || readingLock.current || addingLock.current) return;
    const sequence = ++request.current;
    readingLock.current = true;
    setReading(true); setError(null); setValidate(false);
    try {
      const { scan } = await api.scanQuote({ scanId: id, base64: image.base64 }, token);
      if (!active() || sequence !== request.current) return;
      if (!scan.lines.length) throw new Error('No encontramos productos legibles. Prueba otra foto con mejor luz.');
      setRows(reviewScanLines(scan.lines));
    } catch (err) {
      if (active() && sequence === request.current)
        setError(err instanceof Error ? err.message : 'No se pudo leer la lista. Inténtalo de nuevo.');
    } finally {
      if (sequence === request.current) {
        readingLock.current = false;
        if (active()) setReading(false);
      }
    }
  };
  const choose = async (source: 'camera' | 'library') => {
    if (!active() || pickingLock.current || readingLock.current || addingLock.current) return;
    const sequence = request.current;
    const pickerSequence = ++pickerRequest.current;
    pickingLock.current = true; setPicking(true);
    try {
      const image = source === 'camera' ? await pickImageFromCamera() : await pickImageFromLibrary();
      if (!image || !active() || sequence !== request.current) return;
      const id = newQuoteScanId();
      setPhoto(image); setScanId(id); setRows([]); setError(null);
      await read(image, id);
    } finally {
      if (pickerSequence === pickerRequest.current) {
        pickingLock.current = false;
        if (active()) setPicking(false);
      }
    }
  };
  const update = (key: string, patch: Partial<ScanReviewRow>) => {
    setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
    setError(null);
  };
  const add = async () => {
    if (!active() || addingLock.current || readingLock.current || pickingLock.current) return;
    const sequence = request.current;
    setValidate(true); setError(null);
    let selected: ScannedQuoteItem[];
    try { selected = scannedQuoteItems(rows); }
    catch (err) { setError(err instanceof Error ? err.message : 'Revisa los productos seleccionados.'); return; }
    addingLock.current = true; setAdding(true);
    try {
      await onAdd(selected);
      if (active() && sequence === request.current) {
        setPhoto(null); setScanId(null); setRows([]); setError(null); setValidate(false);
        shown.current = false;
        request.current += 1;
        onClose();
      }
    } catch (err) {
      if (active() && sequence === request.current) setError(err instanceof Error ? err.message : 'No se pudieron añadir los productos. Revisa la conexión e inténtalo de nuevo.');
    } finally {
      addingLock.current = false;
      if (alive.current) setAdding(false);
    }
  };
  const busy = reading || picking || adding;
  const selectedCount = rows.filter(row => row.included).length;
  const field = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }];

  const errorNotice = error ? <View accessibilityRole="alert" style={[styles.error, { borderColor: colors.error + '55' }]}>
      <Text style={[styles.description, { color: colors.error }]}>{error}</Text>
      {!rows.length && photo && scanId && !busy && <Pressable accessibilityRole="button" style={styles.retry}
        onPress={() => { void read(photo, scanId); }}>
        <Ionicons name="refresh" size={18} color={colors.primary} />
        <Text style={[styles.sourceText, { color: colors.primary }]}>Reintentar esta foto</Text>
      </Pressable>}
    </View> : null;

  return <FormModal visible={visible} title="Escaneo mágico" icon="sparkles-outline" onClose={close}>
    <Text style={[styles.description, { color: colors.muted }]}>
      Fotografía la lista. Compararemos sus productos con el catálogo de tu empresa para que los revises antes de añadirlos.
    </Text>
    <Text style={[styles.caption, { color: colors.muted }]}>Hasta 100 productos por imagen, con un máximo de 8 MB. Divide las listas más largas en varias fotos.</Text>
    <View style={styles.sources}>
      {([{ source: 'camera', label: photo ? 'Otra foto' : 'Tomar foto', icon: 'camera-outline' },
        { source: 'library', label: photo ? 'Cambiar imagen' : 'Elegir imagen', icon: 'images-outline' }] as const).map(option => (
        <Pressable key={option.source} accessibilityRole="button" disabled={busy}
          onPress={() => { void choose(option.source); }}
          style={[styles.source, { borderColor: colors.primary, opacity: busy ? 0.5 : 1 }]}>
          <Ionicons name={option.icon} size={21} color={colors.primary} />
          <Text style={[styles.sourceText, { color: colors.primary }]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
    {photo && <Image source={{ uri: photo.uri }} resizeMode="contain" accessibilityLabel="Foto de la lista a escanear"
      style={[styles.preview, { backgroundColor: colors.background }]} />}
    {reading && <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: colors.primary + '12' }]}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.description, { color: colors.text, flex: 1 }]}>Leyendo la lista y buscando coincidencias…</Text>
    </View>}
    {!rows.length && errorNotice}
    {!!rows.length && <>
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={[styles.summaryTitle, { color: colors.text }]}>Revisar productos ({selectedCount}/{rows.length})</Text>
        <Pressable accessibilityRole="button" disabled={busy} hitSlop={8}
          onPress={() => { const included = selectedCount !== rows.length; setRows(current => current.map(row => ({ ...row, included }))); setError(null); }}>
          <Text style={[styles.link, { color: colors.primary }]}>{selectedCount === rows.length ? 'Desmarcar todos' : 'Seleccionar todos'}</Text>
        </Pressable>
      </View>
      {rows.map((row, index) => {
        const matched = row.mode === 'catalog' && row.productId !== null;
        const label = row.mode === 'new' ? 'Nuevo' : matched ? 'Coincide' : 'Revisar';
        const accent = row.mode === 'new' ? colors.primary : matched ? (dark ? '#86efac' : '#166534') : (dark ? '#fcd34d' : '#92400e');
        const rowError = validate ? scanReviewError(row) : null;
        const editable = row.included && !busy;
        return <View key={row.key} style={[styles.rowCard, { borderColor: colors.border, opacity: row.included ? 1 : 0.6 }]}>
          <View style={styles.rowHeader}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={`Incluir producto ${index + 1}`}
              accessibilityState={{ checked: row.included, disabled: busy }} disabled={busy}
              onPress={() => update(row.key, { included: !row.included })} style={styles.include}>
              <Ionicons name={row.included ? 'checkbox' : 'square-outline'} size={23} color={row.included ? colors.primary : colors.muted} />
              <Text style={[styles.rowTitle, { color: colors.text }]}>Producto {index + 1}</Text>
            </Pressable>
            <View style={[styles.badge, { backgroundColor: accent + '15' }]}>
              <Text style={[styles.badgeText, { color: accent }]}>{label}</Text>
            </View>
          </View>
          <Text style={[styles.caption, { color: colors.muted }]}>Leído: {row.source.name}</Text>
          <Text style={[styles.label, { color: colors.muted }]}>Nombre del producto</Text>
          <TextInput value={row.name} onChangeText={name => update(row.key, { name })} editable={editable} maxLength={row.mode === 'new' ? 150 : 255}
            accessibilityLabel={`Nombre del producto ${index + 1}`} placeholder="Nombre del producto" placeholderTextColor={colors.muted} style={field} />
          {!!row.source.candidates.length && <View style={styles.candidates}>
            <Text style={[styles.label, { color: colors.muted }]}>Coincidencias del catálogo</Text>
            {row.source.candidates.map(product => <Pressable key={product.id} accessibilityRole="radio"
              accessibilityLabel={`Usar ${product.name} en producto ${index + 1}`}
              accessibilityState={{ selected: row.mode === 'catalog' && row.productId === product.id, disabled: !editable }}
              disabled={!editable} onPress={() => update(row.key, selectScanProduct(row, product))}
              style={[styles.candidate, { borderColor: row.mode === 'catalog' && row.productId === product.id ? colors.primary : colors.border }]}>
              <Ionicons name={row.mode === 'catalog' && row.productId === product.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.candidateName, { color: colors.text }]}>{product.name}</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>{formatMoney(product.price)} · {product.unit}{product.codigoInterno ? ' · ' + product.codigoInterno : ''}</Text>
              </View>
            </Pressable>)}
          </View>}
          <Pressable accessibilityRole="radio" accessibilityLabel={`Crear producto nuevo ${index + 1}`}
            accessibilityState={{ selected: row.mode === 'new', disabled: !editable }} disabled={!editable}
            onPress={() => update(row.key, newScanProduct(row))} style={styles.newProduct}>
            <Ionicons name={row.mode === 'new' ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
            <Text style={[styles.description, { color: colors.text }]}>Crear producto nuevo</Text>
          </Pressable>
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Cantidad</Text>
              <TextInput value={row.quantity} onChangeText={quantity => update(row.key, { quantity })} keyboardType="decimal-pad" editable={editable}
                maxLength={12} accessibilityLabel={`Cantidad del producto ${index + 1}`} placeholder="Cantidad" placeholderTextColor={colors.muted} style={field} />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Unidad</Text>
              <TextInput value={row.unit} onChangeText={unit => update(row.key, { unit })} editable={editable} maxLength={20}
                accessibilityLabel={`Unidad del producto ${index + 1}`} placeholder="Unidad" placeholderTextColor={colors.muted} style={field} />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Precio unitario</Text>
              <TextInput value={row.unitPrice} onChangeText={unitPrice => update(row.key, { unitPrice })} keyboardType="decimal-pad" editable={editable}
                maxLength={12} accessibilityLabel={`Precio del producto ${index + 1}`} placeholder="Precio" placeholderTextColor={colors.muted} style={field} />
            </View>
          </View>
          {!!rowError && <Text style={[styles.caption, { color: colors.error }]}>{rowError}</Text>}
        </View>;
      })}
      <Text style={[styles.description, { color: colors.muted }]}>Los productos nuevos se crearán al guardar la cotización. Revisa cantidades, unidades y precios antes de continuar.</Text>
      {rows.length >= 100 && <Text style={[styles.description, { color: colors.primary }]}>Se alcanzó el máximo de 100 productos por foto. Comprueba si quedan líneas en la hoja y escanéalas en otra imagen después de añadir estas.</Text>}
      {errorNotice}
      <PrimaryButton title={`Añadir ${selectedCount} ${selectedCount === 1 ? 'producto' : 'productos'}`}
        onPress={() => { void add(); }} loading={adding} disabled={busy || selectedCount === 0} />
      <Text style={[styles.caption, { color: colors.muted }]}>Elegir otra foto reemplaza esta revisión.</Text>
    </>}
  </FormModal>;
}

const styles = StyleSheet.create({
  description: { fontFamily: 'Poppins', fontSize: 13, lineHeight: 21 },
  sources: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  source: { flex: 1, minWidth: 120, minHeight: 52, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 },
  sourceText: { fontFamily: 'Poppins-SemiBold', fontSize: 12 },
  preview: { height: 132, width: '100%', borderRadius: 14 },
  notice: { padding: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  error: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  retry: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  summary: { gap: 8 },
  summaryTitle: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
  link: { fontFamily: 'Poppins-SemiBold', fontSize: 12 },
  rowCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  include: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36 },
  rowTitle: { fontFamily: 'Poppins-SemiBold', fontSize: 13 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontFamily: 'Poppins-SemiBold', fontSize: 10 },
  caption: { fontFamily: 'Poppins', fontSize: 11, lineHeight: 17 },
  label: { fontFamily: 'Poppins', fontSize: 11 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, minHeight: 46, fontFamily: 'Poppins', fontSize: 13 },
  candidates: { gap: 8 },
  candidate: { borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  candidateName: { fontFamily: 'Poppins-Medium', fontSize: 12 },
  newProduct: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42 },
  fields: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  field: { flexGrow: 1, flexBasis: 90, minWidth: 85, gap: 6 },
});
