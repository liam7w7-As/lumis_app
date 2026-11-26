import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { feedback } from '../lib/feedback';
import { useReducedMotion } from '../context/MotionContext';

interface ScanSheet {
  id: string;
  image: PickedImage;
  rows: ScanReviewRow[];
  status: 'reading' | 'ready' | 'error';
  error: string | null;
}

interface MagicQuoteScanModalProps {
  visible: boolean;
  token: string;
  branchId?: number | null;
  maxItems?: number;
  onClose: () => void;
  onAdd: (items: ScannedQuoteItem[]) => Promise<void> | void;
}

export function MagicQuoteScanModal(props: MagicQuoteScanModalProps) {
  // Preserve a photo's request id when closing, but never share it with another account.
  return <ScanSession key={props.token} {...props} />;
}

function ScanSession({ visible, token, onClose, onAdd, maxItems = 200 }: MagicQuoteScanModalProps) {
  const { colors, dark } = useTheme();
  const formatMoney = useMoney();
  const reducedMotion = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const [sheets, setSheets] = useState<ScanSheet[]>([]);
  const sheetsRef = useRef<ScanSheet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(true);
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
  const changeSheets = useCallback((update: (current: ScanSheet[]) => ScanSheet[]) => {
    const next = update(sheetsRef.current);
    sheetsRef.current = next;
    setSheets(next);
  }, []);
  const interrupt = useCallback(() => changeSheets(current => current.map(sheet => sheet.status === 'reading'
    ? { ...sheet, status: 'error', error: 'La lectura se interrumpió. Reintenta esta hoja para recuperar el resultado sin iniciar otro escaneo.' }
    : sheet)), [changeSheets]);
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
      if (interrupted) interrupt();
      const sequence = request.current;
      readingLock.current = false; pickingLock.current = false;
      void Promise.resolve().then(() => {
        if (!alive.current || shown.current || sequence !== request.current) return;
        setReading(false); setPicking(false);
      });
    }
  }, [visible, interrupt]);
  const active = () => alive.current && shown.current;

  const close = () => {
    if (addingLock.current) return;
    request.current += 1;
    pickerRequest.current += 1;
    shown.current = false;
    if (readingLock.current) interrupt();
    readingLock.current = false; pickingLock.current = false;
    setReading(false); setPicking(false);
    onClose();
  };
  const read = async (image: PickedImage, id: string) => {
    if (!active() || readingLock.current || addingLock.current) return;
    const sequence = ++request.current;
    readingLock.current = true;
    setReading(true); setError(null);
    changeSheets(current => current.map(sheet => sheet.id === id ? { ...sheet, status: 'reading', error: null } : sheet));
    try {
      const { scan } = await api.scanQuote({ scanId: id, base64: image.base64 }, token);
      if (!active() || sequence !== request.current) return;
      if (!scan.lines.length) throw new Error('No encontramos productos legibles. Prueba otra foto con mejor luz.');
      changeSheets(current => current.map(sheet => sheet.id === id
        ? { ...sheet, status: 'ready', error: null,
          rows: reviewScanLines(scan.lines).map(row => ({ ...row, key: `${id}:${row.key}` })) }
        : sheet));
    } catch (err) {
      if (active() && sequence === request.current) changeSheets(current => current.map(sheet => sheet.id === id
        ? { ...sheet, status: 'error', error: err instanceof Error ? err.message : 'No se pudo leer esta hoja. Inténtalo de nuevo.' }
        : sheet));
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
      const duplicate = sheetsRef.current.find(sheet => sheet.image.base64 === image.base64);
      if (duplicate) {
        setActiveId(duplicate.id); setSourcesOpen(false);
        setError('Esta imagen ya está añadida. Revisa su hoja o reintenta su lectura si quedó pendiente.');
        return;
      }
      const id = newQuoteScanId();
      changeSheets(current => [...current, { id, image, rows: [], status: 'reading', error: null }]);
      setActiveId(id); setSourcesOpen(false); setError(null);
      await read(image, id);
    } finally {
      if (pickerSequence === pickerRequest.current) {
        pickingLock.current = false;
        if (active()) setPicking(false);
      }
    }
  };
  const update = (key: string, patch: Partial<ScanReviewRow>) => {
    changeSheets(current => current.map(sheet => ({ ...sheet,
      rows: sheet.rows.map(row => row.key === key ? { ...row, ...patch } : row) })));
    setError(null);
  };
  const removeSheet = (id: string) => {
    if (readingLock.current || pickingLock.current || addingLock.current) return;
    feedback.warning('Quitar hoja', 'Se quitarán de esta revisión los productos de esta hoja.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar hoja', style: 'destructive', onPress: () => {
        if (!active() || readingLock.current || pickingLock.current || addingLock.current) return;
        const remaining = sheetsRef.current.filter(sheet => sheet.id !== id);
        changeSheets(() => remaining);
        setActiveId(remaining[0]?.id ?? null);
        if (!remaining.length) setSourcesOpen(true);
        setError(null);
      } },
    ]);
  };
  const add = async () => {
    if (!active() || addingLock.current || readingLock.current || pickingLock.current) return;
    const sequence = request.current;
    setValidate(true); setError(null);
    let selected: ScannedQuoteItem[];
    try {
      if (sheetsRef.current.some(sheet => sheet.status !== 'ready')) throw new Error('Hay hojas sin completar. Reintenta su lectura o quítalas antes de añadir los productos.');
      const all = sheetsRef.current.flatMap(sheet => sheet.rows);
      if (all.filter(row => row.included).length > maxItems) throw new Error(`Puedes añadir hasta ${maxItems} artículos más a esta cotización. Desmarca algunos productos para continuar.`);
      for (const [sheetIndex, sheet] of sheetsRef.current.entries()) {
        const invalidIndex = sheet.rows.findIndex(row => scanReviewError(row));
        if (invalidIndex >= 0) {
          setActiveId(sheet.id);
          throw new Error(`Hoja ${sheetIndex + 1}, producto ${invalidIndex + 1}: ${scanReviewError(sheet.rows[invalidIndex])}`);
        }
      }
      selected = scannedQuoteItems(all);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Revisa los productos seleccionados.'); return; }
    addingLock.current = true; setAdding(true);
    try {
      await onAdd(selected);
      if (active() && sequence === request.current) {
        changeSheets(() => []); setActiveId(null); setSourcesOpen(true); setError(null); setValidate(false);
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
  const allRows = sheets.flatMap(sheet => sheet.rows);
  const selectedCount = allRows.filter(row => row.included).length;
  const currentSheet = sheets.find(sheet => sheet.id === activeId) ?? sheets[0];
  const sheetIndex = currentSheet ? sheets.indexOf(currentSheet) : -1;
  const rows = currentSheet?.rows ?? [];
  const pendingSheets = sheets.filter(sheet => sheet.status !== 'ready').length;
  const overLimit = selectedCount > maxItems;
  const field = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }];

  const errorNotice = error ? <View accessibilityRole="alert" style={[styles.error, { borderColor: colors.error + '55' }]}>
      <Text style={[styles.description, { color: colors.error }]}>{error}</Text>
    </View> : null;

  const footer = allRows.length ? <>
    <View style={styles.scrollControls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Ir al inicio de la revisión" style={styles.scrollControl}
        onPress={() => { Keyboard.dismiss(); scroll.current?.scrollTo({ y: 0, animated: !reducedMotion }); }}>
        <Ionicons name="arrow-up-outline" size={18} color={colors.primary} />
        <Text style={[styles.sourceText, { color: colors.primary }]}>Inicio</Text>
      </Pressable>
      <Text style={[styles.caption, { color: colors.muted }]}>{selectedCount} seleccionados</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Ir al final de la revisión" style={styles.scrollControl}
        onPress={() => { Keyboard.dismiss(); scroll.current?.scrollToEnd({ animated: !reducedMotion }); }}>
        <Text style={[styles.sourceText, { color: colors.primary }]}>Final</Text>
        <Ionicons name="arrow-down-outline" size={18} color={colors.primary} />
      </Pressable>
    </View>
    {pendingSheets > 0 && <Text style={[styles.caption, { color: colors.muted }]}>Hay {pendingSheets} {pendingSheets === 1 ? 'hoja pendiente' : 'hojas pendientes'} de lectura.</Text>}
    {overLimit && <Text style={[styles.caption, { color: colors.error }]}>Puedes añadir {maxItems} artículos. Desmarca algunos para continuar.</Text>}
    {errorNotice}
    <PrimaryButton title={`Añadir ${selectedCount} ${selectedCount === 1 ? 'producto' : 'productos'}`}
      onPress={() => { void add(); }} loading={adding} disabled={busy || selectedCount === 0 || pendingSheets > 0 || overLimit} />
  </> : undefined;

  return <FormModal visible={visible} title="Escaneo mágico" icon="sparkles-outline" onClose={close} footer={footer} scrollRef={scroll}>
    <Text style={[styles.description, { color: colors.muted }]}>
      Fotografía la lista. Compararemos sus productos con el catálogo de tu empresa para que los revises antes de añadirlos.
    </Text>
    <Text style={[styles.caption, { color: colors.muted }]}>Hasta 100 productos y 8 MB por imagen. Añade más hojas sin perder las anteriores.</Text>
    {!!sheets.length && <View style={styles.sheetList}>
      {sheets.map((sheet, index) => <View key={sheet.id} style={[styles.sheet, { borderColor: sheet.id === currentSheet?.id ? colors.primary : colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Revisar hoja ${index + 1}`}
          accessibilityState={{ selected: sheet.id === currentSheet?.id, disabled: busy }} disabled={busy}
          onPress={() => { setActiveId(sheet.id); setError(null); }} style={styles.sheetSelect}>
          <Ionicons name={sheet.status === 'ready' ? 'document-text-outline' : sheet.status === 'reading' ? 'hourglass-outline' : 'alert-circle-outline'}
            size={22} color={sheet.status === 'error' ? colors.error : colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Hoja {index + 1}</Text>
            <Text style={[styles.caption, { color: sheet.status === 'error' ? colors.error : colors.muted }]}>
              {sheet.status === 'ready' ? `${sheet.rows.filter(row => row.included).length} de ${sheet.rows.length} productos` : sheet.status === 'reading' ? 'Leyendo…' : 'Pendiente de lectura'}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar hoja ${index + 1}`} disabled={busy}
          onPress={() => removeSheet(sheet.id)} style={styles.removeSheet}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>)}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => setSourcesOpen(true)}
        style={[styles.source, { borderColor: colors.primary, opacity: busy ? 0.5 : 1 }]}>
        <Ionicons name="add-outline" size={22} color={colors.primary} />
        <Text style={[styles.sourceText, { color: colors.primary }]}>Añadir hoja</Text>
      </Pressable>
    </View>}
    {sourcesOpen && <View style={styles.sources}>
      {([{ source: 'camera', label: 'Tomar foto', icon: 'camera-outline' },
        { source: 'library', label: 'Elegir imagen', icon: 'images-outline' }] as const).map(option => (
        <Pressable key={option.source} accessibilityRole="button" disabled={busy}
          onPress={() => { void choose(option.source); }}
          style={[styles.source, { borderColor: colors.primary, opacity: busy ? 0.5 : 1 }]}>
          <Ionicons name={option.icon} size={21} color={colors.primary} />
          <Text style={[styles.sourceText, { color: colors.primary }]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>}
    {currentSheet && <Image source={{ uri: currentSheet.image.uri }} resizeMode="contain" accessibilityLabel={`Foto de la hoja ${sheetIndex + 1}`}
      style={[styles.preview, { backgroundColor: colors.background }]} />}
    {reading && <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: colors.primary + '12' }]}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.description, { color: colors.text, flex: 1 }]}>Leyendo hoja {sheetIndex + 1} de {sheets.length} y buscando coincidencias…</Text>
    </View>}
    {!!currentSheet?.error && <View accessibilityRole="alert" style={[styles.error, { borderColor: colors.error + '55' }]}>
      <Text style={[styles.description, { color: colors.error }]}>{currentSheet.error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Reintentar hoja ${sheetIndex + 1}`} disabled={busy} style={styles.retry}
        onPress={() => { void read(currentSheet.image, currentSheet.id); }}>
        <Ionicons name="refresh" size={18} color={colors.primary} />
        <Text style={[styles.sourceText, { color: colors.primary }]}>Reintentar esta hoja</Text>
      </Pressable>
    </View>}
    {!!allRows.length && <>
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={[styles.summaryTitle, { color: colors.text }]}>Revisar productos ({selectedCount}/{allRows.length})</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>Hoja {sheetIndex + 1} de {sheets.length} · Puedes añadir {maxItems} artículos a esta cotización.</Text>
        <Pressable accessibilityRole="button" disabled={busy} hitSlop={8}
          onPress={() => { const included = selectedCount !== allRows.length; changeSheets(current => current.map(sheet => ({ ...sheet, rows: sheet.rows.map(row => ({ ...row, included })) }))); setError(null); }}>
          <Text style={[styles.link, { color: colors.primary }]}>{selectedCount === allRows.length ? 'Desmarcar todos' : 'Seleccionar todos'}</Text>
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
          <TextInput value={row.name} onChangeText={name => update(row.key, { name })} editable={editable} maxLength={255}
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
                onEndEditing={({ nativeEvent }) => { if (!nativeEvent.text.trim()) update(row.key, { unitPrice: '0' }); }}
                maxLength={12} accessibilityLabel={`Precio del producto ${index + 1}`} placeholder="Precio" placeholderTextColor={colors.muted} style={field} />
            </View>
          </View>
          {!!rowError && <Text style={[styles.caption, { color: colors.error }]}>{rowError}</Text>}
        </View>;
      })}
      <Text style={[styles.description, { color: colors.muted }]}>Los datos faltantes pueden quedar vacíos. El precio que falte se guardará como 0. Las coincidencias sin elegir se añadirán sin vincular al catálogo.</Text>
      {rows.length >= 100 && <Text style={[styles.description, { color: colors.primary }]}>Esta hoja alcanzó los 100 productos. Si quedan líneas sin leer, fotografía esa parte con «Añadir hoja».</Text>}
      {overLimit && <Text accessibilityRole="alert" style={[styles.description, { color: colors.error }]}>Seleccionaste {selectedCount} productos. Puedes añadir {maxItems}; desmarca los que no necesitas.</Text>}
      {!!pendingSheets && <Text style={[styles.description, { color: colors.muted }]}>Completa o quita las hojas pendientes para añadir todos los productos juntos.</Text>}
    </>}
    {!allRows.length && errorNotice}
  </FormModal>;
}

const styles = StyleSheet.create({
  sheetList: { gap: 8 },
  scrollControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  scrollControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 42, paddingHorizontal: 3 },
  sheet: { borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center' },
  sheetSelect: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 60 },
  removeSheet: { padding: 12, minHeight: 48, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
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
