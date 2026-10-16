import { FormModal } from '../components/FormModal';
import { DatePickerModal } from '../components/DatePickerModal';
import { feedback } from '../lib/feedback';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type QuoteDetail, type QuoteItem, type QuoteStatus } from '../lib/api';
import { formatDate } from '../lib/format';
import { useMoney, useBusiness } from '../context/BusinessContext';
import { ItemSwipe } from '../components/ItemSwipe';
import { ReorderItemsModal } from '../components/ReorderItemsModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { STATUS_COLOR, STATUS_LABEL } from '../components/QuoteCard';

function parseNum(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

export function QuoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const quoteId = Number(id);
  const { token } = useAuth();
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { business } = useBusiness();
  const insets = useSafeAreaInsets();

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState('');
  const [includeSeal, setIncludeSeal] = useState(true);
  const [showNotes, setShowNotes] = useState(true);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [editQty, setEditQty] = useState('1');
  const [editPrice, setEditPrice] = useState('');
  const [itemBusy, setItemBusy] = useState(false);
  const requestId = useRef(0);
  const loadedQuote = useRef<number | null>(null);
  const [ordering, setOrdering] = useState(false);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    if (!token || !Number.isSafeInteger(quoteId) || quoteId <= 0) {
      setQuote(null);
      setError('Cotización no encontrada');
      setLoading(false);
      return;
    }
    if (loadedQuote.current !== quoteId) setLoading(true);
    setError(null);
    try {
      const { quote: data } = await api.quoteDetail(quoteId, token);
      if (request !== requestId.current) return;
      loadedQuote.current = quoteId;
      setQuote(data);
      setNotes(data.notes ?? '');
      setIncludeSeal(data.includeSeal);
      setShowNotes(data.showNotes);
      setIncludeSignature(data.includeSignature);
    } catch (err) {
      if (request === requestId.current) {
        const message = err instanceof ApiError ? err.message : 'No se pudo cargar la cotización.';
        setError(message); feedback.error('No se pudo abrir la cotización', message);
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

  const editable = quote?.status === 'borrador';
  const saveable = quote != null && quote.status !== 'convertida';

  const saveDate = async (createdAt: string) => {
    if (!token || !quote || !saveable) throw new Error('Esta cotización no admite cambios.');
    const request = requestId.current;
    const result = await api.updateQuote(quote.id, { createdAt }, token);
    if (request !== requestId.current) return;
    setQuote((current) => current?.id === quote.id ? { ...current, createdAt: result.createdAt ?? createdAt } : current);
  };

  const refreshItems = async () => {
    if (!token || !quote) return;
    const { quote: updated } = await api.quoteDetail(quote.id, token);
    setQuote((current) => current ? { ...current, items: updated.items, total: updated.total } : current);
  };
  const persistItemDraft = async () => {
    if (!token || !quote || !editable || expandedItem == null) return;
    const item = quote.items.find((entry) => entry.id === expandedItem);
    if (!item) return;
    const quantity = parseNum(editQty), unitPrice = parseNum(editPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Revisa la cantidad y el precio del producto.');
    if (quantity !== item.quantity || unitPrice !== item.unitPrice) await api.updateQuoteItem(quote.id, item.id, { quantity, unitPrice }, token);
    setExpandedItem(null);
  };
  const duplicateItem = async (item: QuoteItem) => {
    if (!token || !quote || itemBusy) return;
    setItemBusy(true);
    try { await persistItemDraft(); await api.duplicateItem('quotes', quote.id, item.id, token); await refreshItems(); }
    catch (err) { feedback.alert('Error', err instanceof Error ? err.message : 'No se pudo duplicar'); }
    finally { setItemBusy(false); }
  };
  const reorderItems = async (ids: number[]) => {
    if (!token || !quote) return;
    await persistItemDraft(); await api.reorderItems('quotes', quote.id, ids, token); await refreshItems();
  };
  const persistDocumentOptions = async () => {
    if (!token || !quote || !saveable) return;
    const patch = { notes: notes.trim() || null, includeSeal, showNotes, includeSignature };
    if (patch.notes === quote.notes && includeSeal === quote.includeSeal
      && showNotes === quote.showNotes && includeSignature === quote.includeSignature) return;
    await api.updateQuote(quote.id, patch, token);
    setQuote({ ...quote, ...patch });
  };

  const save = async () => {
    if (!token || !quote || saving) return;
    setSaving(true);
    try {
      await persistItemDraft();
      await persistDocumentOptions();
      feedback.alert('Guardado', 'Cambios guardados');
      await refreshItems();
    } catch (err) {
      feedback.alert('Error', err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const openPreview = async () => {
    if (!token || !quote || saving || itemBusy) return;
    setSaving(true);
    try {
      await persistItemDraft();
      await persistDocumentOptions();
      router.push(`/quotes/${quote.id}/preview`);
    } catch (err) {
      feedback.alert('Error', err instanceof Error ? err.message : 'No se pudieron guardar las opciones del documento');
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async (status: 'borrador' | 'aprobada' | 'rechazada') => {
    if (!token || !quote) return;
    try {
      await api.updateQuote(quote.id, { status }, token);
      load();
    } catch (err) {
      feedback.alert('Error', err instanceof ApiError ? err.message : 'No se pudo cambiar el estado');
    }
  };

  const changeStatus = () => {
    if (!quote || quote.status === 'convertida') return;
    const options: { label: string; value: QuoteStatus }[] = [
      { label: 'Borrador', value: 'borrador' },
      { label: 'Aprobada', value: 'aprobada' },
      { label: 'Rechazada', value: 'rechazada' },
    ];
    feedback.alert('Estado', 'Cambia el estado de la cotización', [
      ...options
        .filter((o) => o.value !== quote.status)
        .map((o) => ({ text: o.label, onPress: () => applyStatus(o.value as 'borrador' | 'aprobada' | 'rechazada') })),
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const toggleItem = (item: QuoteItem) => {
    if (!editable) return;
    if (expandedItem === item.id) {
      setExpandedItem(null);
      return;
    }
    setExpandedItem(item.id);
    setEditQty(String(item.quantity));
    setEditPrice(String(item.unitPrice));
  };

  const saveItem = async (item: QuoteItem) => {
    if (!token || !quote) return;
    const qty = parseNum(editQty);
    const price = parseNum(editPrice);
    if (!Number.isFinite(qty) || qty <= 0) {
      feedback.alert('Error', 'La cantidad debe ser mayor a 0');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      feedback.alert('Error', 'El precio no puede ser negativo');
      return;
    }
    setItemBusy(true);
    try {
      await api.updateQuoteItem(quote.id, item.id, { quantity: qty, unitPrice: price }, token);
      setExpandedItem(null);
      await refreshItems();
    } catch (err) {
      feedback.alert('Error', err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setItemBusy(false);
    }
  };

  const removeItem = (item: QuoteItem) => {
    if (!token || !quote) return;
    feedback.alert('Quitar artículo', `¿Quitar "${item.description}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteQuoteItem(quote.id, item.id, token);
            setExpandedItem(null);
            await refreshItems();
          } catch (err) {
            feedback.alert('Error', err instanceof ApiError ? err.message : 'No se pudo quitar');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !quote) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.muted }]}>
          {error ?? 'Cotización no encontrada'}
        </Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.backLink, { color: colors.primary }]}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const statusColor = quote.status === 'convertida' ? colors.primary : STATUS_COLOR[quote.status];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 32 + insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Cotización</Text>
          {saveable ? (
            <Pressable
              style={[styles.circleButton, { backgroundColor: colors.primary }]}
              onPress={save}
              disabled={saving}
              hitSlop={8}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>Guardar</Text>
              )}
            </Pressable>
          ) : (
            <View style={styles.circleSpacer} />
          )}
        </View>

        <View style={styles.metaRow}>
          <Pressable style={styles.dateWrap} onPress={() => setDateOpen(true)}
            accessibilityRole="button" accessibilityLabel="Editar fecha de la cotización" disabled={!saveable || saving || itemBusy}>
            <Text style={[styles.metaText, { color: colors.muted }]}>
              Fecha {formatDate(quote.createdAt)}
            </Text>
            {saveable && <Ionicons name="pencil-outline" size={13} color={colors.muted} />}
          </Pressable>
          <Text style={[styles.metaText, { color: colors.muted }]}>
            COTIZACIÓN Nº {quote.id}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.vendorBlock}>
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Vendedor</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="person-outline" size={16} color={colors.muted} />
              <Text style={[styles.vendorName, { color: colors.muted }]} numberOfLines={1}>
                {quote.sellerName.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.vendorBlock}>
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Sucursal</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="storefront-outline" size={16} color={colors.muted} />
              <Text style={[styles.vendorName, { color: colors.muted }]} numberOfLines={1}>
                {quote.branchName ?? 'Sin sucursal'}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.statusRow, { backgroundColor: colors.surface }]}>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABEL[quote.status]}
            </Text>
          </View>
          {quote.status !== 'convertida' && (
            <Pressable onPress={changeStatus} hitSlop={10}>
              <Text style={[styles.changeText, { color: colors.primary }]}>Cambiar</Text>
            </Pressable>
          )}
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Cliente / Empresa</Text>
          <Pressable
            style={styles.clientRow}
            onPress={() => quote.client && setClientOpen(true)}
            disabled={!quote.client}
          >
            <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
              {quote.client?.name ?? 'Sin Cliente'}
            </Text>
            {quote.client && <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
          </Pressable>
        </View>

        {quote.items.map((item, index) => {
          const expanded = expandedItem === item.id;
          return (
            <ItemSwipe key={item.id} disabled={!editable || itemBusy} onEdit={() => { if (!expanded) toggleItem(item); }}
              onDelete={() => removeItem(item)} onDuplicate={() => { void duplicateItem(item); }} onMove={() => setOrdering(true)}>
            <View style={[styles.itemCard, { backgroundColor: colors.surface }]}>
              <Pressable onPress={() => toggleItem(item)} disabled={!editable}>
                <View style={styles.itemRow}>
                  <View style={[styles.itemNumber, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.itemNumberText, { color: colors.onPrimary }]}>
                      {index + 1}
                    </Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                    <Text style={[styles.itemDetail, { color: colors.muted }]}>
                      {item.quantity} x {formatMoney(item.unitPrice)}
                    </Text>
                  </View>
                  <Text style={[styles.itemSubtotal, { color: colors.text }]}>
                    {formatMoney(item.subtotal)}
                  </Text>
                  {editable && (
                    <Ionicons
                      name={expanded ? 'chevron-down' : 'chevron-back'}
                      size={18}
                      color={colors.muted}
                    />
                  )}
                </View>
              </Pressable>
              {expanded && (
                <View style={styles.editor}>
                  <View style={styles.qtyRow}>
                    <Pressable
                      style={[styles.stepper, { borderColor: colors.border }]}
                      onPress={() => {
                        const v = parseNum(editQty);
                        if (Number.isFinite(v) && v > 1) setEditQty(String(Math.round((v - 1) * 100) / 100));
                      }}
                    >
                      <Ionicons name="remove" size={18} color={colors.text} />
                    </Pressable>
                    <TextInput
                      style={[styles.qtyInput, { color: colors.text, borderBottomColor: colors.border }]}
                      value={editQty}
                      onChangeText={setEditQty}
                      keyboardType="decimal-pad"
                    />
                    <Pressable
                      style={[styles.stepper, { borderColor: colors.border }]}
                      onPress={() => {
                        const v = parseNum(editQty);
                        if (Number.isFinite(v)) setEditQty(String(Math.round((v + 1) * 100) / 100));
                      }}
                    >
                      <Ionicons name="add" size={18} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.unitLabel, { color: colors.muted }]}>{item.unit}</Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={[styles.pricePrefix, { color: colors.muted }]}>{business?.moneda ?? 'Bs.'}</Text>
                    <TextInput
                      style={[styles.priceInput, { color: colors.text, borderBottomColor: colors.border }]}
                      value={editPrice}
                      onChangeText={setEditPrice}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.editorActions}>
                    <Pressable
                      style={[styles.editorSave, { backgroundColor: colors.primary }]}
                      onPress={() => saveItem(item)}
                      disabled={itemBusy}
                    >
                      {itemBusy ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                      ) : (
                        <Text style={[styles.editorSaveText, { color: colors.onPrimary }]}>
                          Guardar
                        </Text>
                      )}
                    </Pressable>
                    <Pressable onPress={() => removeItem(item)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={22} color={colors.error} />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
            </ItemSwipe>
          );
        })}

        {editable && (
          <PrimaryButton
            title="+  Añadir producto"
            onPress={() => router.push(`/quotes/${quote.id}/add-item`)}
          />
        )}

        <View style={styles.totalRow}>
          <View />
          <Text style={[styles.totalValue, { color: colors.text }]}>
            Total {formatMoney(quote.total)}
          </Text>
        </View>

        {saveable && (
          <>
            <Pressable style={styles.toggleRow} onPress={() => setIncludeSeal(!includeSeal)}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Incluir sello</Text>
              <View
                style={[
                  styles.toggle,
                  { borderColor: colors.primary },
                  includeSeal && { backgroundColor: colors.primary },
                ]}
              >
                {includeSeal && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
              </View>
            </Pressable>
            <Pressable style={styles.toggleRow} onPress={() => setShowNotes(!showNotes)}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Notas adicionales</Text>
              <View
                style={[
                  styles.toggle,
                  { borderColor: colors.primary },
                  showNotes && { backgroundColor: colors.primary },
                ]}
              >
                {showNotes && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
              </View>
            </Pressable>
            <Pressable
              style={styles.toggleRow}
              onPress={() => setIncludeSignature(!includeSignature)}
            >
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Pie de firma</Text>
              <View
                style={[
                  styles.toggle,
                  { borderColor: colors.primary },
                  includeSignature && { backgroundColor: colors.primary },
                ]}
              >
                {includeSignature && (
                  <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                )}
              </View>
            </Pressable>
          </>
        )}

        {showNotes && saveable && (
          <TextInput
            style={[
              styles.notesBox,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notas adicionales"
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />
        )}

        <PrimaryButton
          title="Generar vista previa"
          onPress={openPreview}
          loading={saving}
          disabled={itemBusy}
        />
      </ScrollView>

      {dateOpen && <DatePickerModal title="Fecha de la cotización" value={quote.createdAt}
        onClose={() => setDateOpen(false)} onSave={saveDate} />}
      <ReorderItemsModal visible={ordering} items={quote.items} onClose={() => setOrdering(false)} onSave={reorderItems} />
      <FormModal visible={clientOpen} title="Datos del cliente" icon="person-outline" onClose={() => setClientOpen(false)}>

            <Text style={[styles.clientCardName, { color: colors.text }]}>
              {quote.client?.name}
            </Text>
            <Text style={[styles.clientCardDetail, { color: colors.muted }]}>
              {quote.client?.phone ?? 'Sin teléfono'}
            </Text>
            <Text style={[styles.clientCardDetail, { color: colors.muted }]}>
              {quote.client?.email ?? 'Sin email'}
            </Text>
            <View style={styles.clientCardButton}>
              <PrimaryButton title="Cerrar" onPress={() => setClientOpen(false)} />
            </View>
      </FormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 15,
    fontFamily: 'Poppins',
    textAlign: 'center',
  },
  backLink: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  circleButton: {
    minWidth: 76,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSpacer: {
    width: 44,
  },
  dateWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  vendorBlock: {
    flex: 1,
    gap: 6,
  },
  vendorLabel: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  vendorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vendorName: {
    fontSize: 13,
    fontFamily: 'Poppins',
    flex: 1,
  },
  divider: {
    width: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  changeText: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Poppins',
    marginBottom: 2,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  clientName: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
    flex: 1,
  },
  itemCard: {
    borderRadius: 14,
    padding: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNumberText: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  itemDetail: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  itemSubtotal: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  editor: {
    marginTop: 12,
    gap: 10,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    borderBottomWidth: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    minWidth: 60,
    textAlign: 'center',
    paddingBottom: 4,
  },
  unitLabel: {
    fontSize: 14,
    fontFamily: 'Poppins',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  pricePrefix: {
    fontSize: 14,
    fontFamily: 'Poppins',
    paddingBottom: 8,
  },
  priceInput: {
    borderBottomWidth: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    minWidth: 100,
    paddingBottom: 8,
  },
  editorActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editorSave: {
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  editorSaveText: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  totalValue: {
    fontSize: 20,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  toggle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesBox: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 90,
    padding: 12,
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  clientCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  clientCardName: {
    fontSize: 18,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  clientCardDetail: {
    fontSize: 14,
    fontFamily: 'Poppins',
  },
  clientCardButton: {
    marginTop: 12,
  },
});
