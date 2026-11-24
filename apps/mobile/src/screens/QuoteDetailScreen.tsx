import { TutorialTarget, TutorialScrollView, TutorialHelpButton, useTutorialAvailability, withTutorial } from '../tutorials/TutorialElements';
import { useTutorial } from '../tutorials/TutorialContext';
import { DocumentClientModal } from '../components/DocumentClientModal';
import { getDocumentClient, verifySavedDocumentClient } from '../lib/documentClient';
import { DatePickerModal } from '../components/DatePickerModal';
import { feedback } from '../lib/feedback';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { ApiError, api, type DocumentClientDetails, type QuoteDetail, type QuoteItem, type QuoteStatus } from '../lib/api';
import { formatDate } from '../lib/format';
import { useMoney, useBusiness } from '../context/BusinessContext';
import { ItemSwipe } from '../components/ItemSwipe';
import { ReorderItemsModal } from '../components/ReorderItemsModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { DocumentOptions } from '../components/DocumentOptions';
import { STATUS_COLOR, STATUS_LABEL } from '../components/QuoteCard';
import { useDocumentEditAccess } from '../hooks/useDocumentEditAccess';
import { ProBadge } from '../components/ProBadge';
import { changedQuoteOptions } from '../lib/quoteOptions';
import { IS_NOVALED } from '../lib/backend';
import { useKeyboardAwareNotes } from '../hooks/useKeyboardAwareNotes';

const METADATA_MAX_LENGTH = IS_NOVALED ? 150 : 100;

function parseNum(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

function QuoteDetailScreenContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const quoteId = Number(id);
  const { token } = useAuth();
  const { colors } = useTheme();
  const formatMoney = useMoney();
  const { business } = useBusiness();
  const {canEdit,proLocked,requestEdit,access}=useDocumentEditAccess();
  const insets = useSafeAreaInsets();
  const { scrollRef: notesScrollRef, inputRef: notesInputRef, onScroll: onNotesScroll,
    reveal: revealNotes, inputStyle: notesInputStyle } = useKeyboardAwareNotes();

  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useTutorialAvailability({ ready: !loading && !!quote, hasItems: (quote?.items.length ?? 0) > 0 });
  const tutorial = useTutorial();

  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState('');
  const [includeSeal, setIncludeSeal] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const editNameRef = useRef('');
  const [editMarca, setEditMarca] = useState('');
  const [editProcedencia, setEditProcedencia] = useState('');
  const editMetadataRef = useRef({ marca: '', procedencia: '', marcaTouched: false, procedenciaTouched: false });
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

  const saveClientDetails = async (clientDetails: DocumentClientDetails) => {
    if (!token || !quote || !saveable || !requestEdit()) throw new Error('Este documento está en modo consulta.');
    await api.updateQuote(quote.id, { clientDetails }, token);
    const updated = await api.quoteDetail(quote.id, token);
    verifySavedDocumentClient(updated.quote.clientDetails, clientDetails);
    setQuote(current => current?.id === quote.id ? { ...current, clientDetails, clientName: clientDetails.name } : current);
  };

  const saveDate = async (createdAt: string) => {
    if(!requestEdit())return;
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
  const itemDraftInput = () => {
    const description = editNameRef.current.trim();
    if (!description) throw new Error('El nombre del artículo no puede quedar vacío.');
    if (description.length > 255) throw new Error('El nombre del artículo admite hasta 255 caracteres.');
    const quantity = parseNum(editQty), unitPrice = parseNum(editPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('La cantidad debe ser mayor a 0');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Escribe un precio válido, mayor o igual a 0.');
    const marca = editMetadataRef.current.marca.trim() || null;
    const procedencia = editMetadataRef.current.procedencia.trim() || null;
    if ((marca?.length ?? 0) > METADATA_MAX_LENGTH) throw new Error(`La marca admite hasta ${METADATA_MAX_LENGTH} caracteres.`);
    if ((procedencia?.length ?? 0) > METADATA_MAX_LENGTH) throw new Error(`La procedencia admite hasta ${METADATA_MAX_LENGTH} caracteres.`);
    return { description, quantity, unitPrice,
      ...(editMetadataRef.current.marcaTouched ? { marca } : {}),
      ...(editMetadataRef.current.procedenciaTouched ? { procedencia } : {}) };
  };
  const persistItemDraft = async () => {
    if (!token || !quote || !editable || expandedItem == null) return;
    if(!canEdit) return;
    const item = quote.items.find((entry) => entry.id === expandedItem);
    if (!item) return;
    const input = itemDraftInput();
    if (input.description !== item.description || input.quantity !== item.quantity || input.unitPrice !== item.unitPrice
      || input.marca !== undefined || input.procedencia !== undefined) {
      await api.updateQuoteItem(quote.id, item.id, input, token);
    }
    setExpandedItem(null);
  };
  const duplicateItem = async (item: QuoteItem) => {
    if(!requestEdit())return;
    if (!token || !quote || itemBusy) return;
    setItemBusy(true);
    try { await persistItemDraft(); await api.duplicateItem('quotes', quote.id, item.id, token); await refreshItems(); }
    catch (err) { feedback.alert('Error', err instanceof Error ? err.message : 'No se pudo duplicar'); }
    finally { setItemBusy(false); }
  };
  const reorderItems = async (ids: number[]) => {
    if(!requestEdit())return;
    if (!token || !quote) return;
    await persistItemDraft(); await api.reorderItems('quotes', quote.id, ids, token); await refreshItems();
  };
  const persistDocumentOptions = async () => {
    if (!token || !quote || !saveable) return true;
    const patch=changedQuoteOptions(quote,{notes,includeSeal,showNotes,includeSignature});
    if(Object.keys(patch).length===0)return true;
    if(patch.notes!==undefined && !requestEdit())return false;
    await api.updateQuote(quote.id, patch, token);
    setQuote(current => current ? { ...current, ...patch } : current);
    return true;
  };

  const save = async () => {
    if (!token || !quote || saving) return;
    if (access === 'read_only' || access === 'checking') { requestEdit(); return; }
    setSaving(true);
    try {
      await persistItemDraft();
      if (!await persistDocumentOptions()) return;
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
      if(access==='allowed' || access==='pro'){
        await persistItemDraft();
        if (!await persistDocumentOptions()) return;
      }
      router.push(`/quotes/${quote.id}/preview`);
    } catch (err) {
      feedback.alert('Error', err instanceof Error ? err.message : 'No se pudieron guardar las opciones del documento');
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async (status: 'borrador' | 'aprobada' | 'rechazada') => {
    if (!token || !quote) return;
    if (access === 'read_only' || access === 'checking') { requestEdit(); return; }
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
        .filter((o) => o.value !== quote.status && (!quote.allowedStatuses || quote.allowedStatuses.includes(o.value)))
        .map((o) => ({ text: o.label, onPress: () => applyStatus(o.value as 'borrador' | 'aprobada' | 'rechazada') })),
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const toggleItem = (item: QuoteItem) => {
    if (!editable || itemBusy || saving) return;
    if(!requestEdit())return;
    if (expandedItem === item.id) {
      setExpandedItem(null);
      return;
    }
    setExpandedItem(item.id);
    editNameRef.current = item.description;
    setEditName(item.description);
    editMetadataRef.current = { marca: item.marca ?? '', procedencia: item.procedencia ?? '', marcaTouched: false, procedenciaTouched: false };
    setEditMarca(item.marca ?? '');
    setEditProcedencia(item.procedencia ?? '');
    setEditQty(String(item.quantity));
    setEditPrice(String(item.unitPrice));
  };

  const saveItem = async (item: QuoteItem) => {
    if(!requestEdit())return;
    if (!token || !quote || itemBusy || saving) return;
    try {
      const input = itemDraftInput();
      setItemBusy(true);
      await api.updateQuoteItem(quote.id, item.id, input, token);
      setExpandedItem(null);
      await refreshItems();
    } catch (err) {
      feedback.alert('Error', err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setItemBusy(false);
    }
  };

  const removeItem = (item: QuoteItem) => {
    if(!requestEdit())return;
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.screen, { backgroundColor: colors.background }]}>
      <TutorialScrollView
        ref={notesScrollRef}
        onScroll={onNotesScroll}
        onLayout={revealNotes}
        onContentSizeChange={revealNotes}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 32 + insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>Cotización</Text><TutorialHelpButton />
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
          <TutorialTarget id="date" ><Pressable style={styles.dateWrap} onPress={() => {if(requestEdit())setDateOpen(true);}}
            accessibilityRole="button" accessibilityLabel="Editar fecha de la cotización" disabled={!saveable || saving || itemBusy || quote.canEditDate === false}>
            <Text style={[styles.metaText, { color: colors.muted }]}>
              Fecha {formatDate(quote.createdAt)}
            </Text>
            {saveable && quote.canEditDate !== false && (proLocked?<ProBadge/>:<Ionicons name="pencil-outline" size={13} color={colors.muted} />)}
          </Pressable></TutorialTarget>
          <Text style={[styles.metaText, { color: colors.muted }]}>
            COTIZACIÓN Nº {quote.number ?? quote.id}
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

        <TutorialTarget id="client" ><View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Cliente / Empresa</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Editar datos del cliente"
            collapsable={false} style={styles.clientRow} disabled={!saveable}
            onPress={() => { if (requestEdit()) setClientOpen(true); }}>
            <Text style={[styles.clientName, { color: colors.text, minHeight: 44, paddingTop: 8 }]}>{quote.clientName ?? quote.client?.name ?? 'Sin Cliente'}</Text>
            {proLocked && saveable ? <ProBadge /> : saveable ? <Ionicons name="create-outline" size={20} color={colors.muted} /> : null}
          </Pressable>
        </View></TutorialTarget>

        {quote.items.map((item, index) => {
          const expanded = expandedItem === item.id;
          return (
            <ItemSwipe tutorialRow={index === 0} key={item.id} proLocked={proLocked} disabled={!editable || itemBusy} onEdit={() => { if (!expanded) toggleItem(item); }}
              onDelete={() => removeItem(item)} onDuplicate={() => { void duplicateItem(item); }} onMove={() => {if(requestEdit())setOrdering(true);}}>
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
                  {editable && (proLocked?<ProBadge/>:(
                    <Ionicons
                      name={expanded ? 'chevron-down' : 'chevron-back'}
                      size={18}
                      color={colors.muted}
                    />
                  ))}
                </View>
              </Pressable>
              {expanded && (
                <View style={styles.editor}>
                  <View>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Nombre del artículo</Text>
                    <TextInput
                      style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]}
                      value={editName}
                      onChangeText={value => { editNameRef.current = value; setEditName(value); }}
                      accessibilityLabel={`Nombre del artículo ${index + 1}`}
                      editable={!itemBusy && !saving}
                      maxLength={255}
                      autoCorrect={false}
                      multiline
                      textAlignVertical="top"
                      returnKeyType="done"
                      submitBehavior="blurAndSubmit"
                    />
                  </View>
                  <View>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Marca (opcional)</Text>
                    <TextInput
                      style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]}
                      value={editMarca}
                      onChangeText={value => { editMetadataRef.current.marca = value; editMetadataRef.current.marcaTouched = true; setEditMarca(value); }}
                      accessibilityLabel={`Marca del artículo ${index + 1}`}
                      editable={!itemBusy && !saving}
                      maxLength={METADATA_MAX_LENGTH}
                      autoCorrect={false}
                      multiline
                      textAlignVertical="top"
                      returnKeyType="done"
                      submitBehavior="blurAndSubmit"
                    />
                  </View>
                  <View>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Procedencia (opcional)</Text>
                    <TextInput
                      style={[styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]}
                      value={editProcedencia}
                      onChangeText={value => { editMetadataRef.current.procedencia = value; editMetadataRef.current.procedenciaTouched = true; setEditProcedencia(value); }}
                      accessibilityLabel={`Procedencia del artículo ${index + 1}`}
                      editable={!itemBusy && !saving}
                      maxLength={METADATA_MAX_LENGTH}
                      autoCorrect={false}
                      multiline
                      textAlignVertical="top"
                      returnKeyType="done"
                      submitBehavior="blurAndSubmit"
                    />
                  </View>
                  <View style={styles.numericFields}>
                  <View style={styles.quantityField}>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Cantidad</Text>
                    <View style={styles.qtyRow}>
                    <Pressable
                      style={[styles.stepper, { borderColor: colors.border }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Disminuir cantidad del artículo ${index + 1}`}
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
                      accessibilityLabel={`Cantidad del artículo ${index + 1}`}
                      keyboardType="decimal-pad"
                    />
                    <Pressable
                      style={[styles.stepper, { borderColor: colors.border }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Aumentar cantidad del artículo ${index + 1}`}
                      onPress={() => {
                        const v = parseNum(editQty);
                        if (Number.isFinite(v)) setEditQty(String(Math.round((v + 1) * 100) / 100));
                      }}
                    >
                      <Ionicons name="add" size={18} color={colors.text} />
                    </Pressable>
                    </View>
                  </View>
                  <View style={styles.priceField}>
                    <Text style={[styles.fieldLabel, { color: colors.muted }]}>Precio</Text>
                  <View style={styles.priceRow}>
                    <Text style={[styles.pricePrefix, { color: colors.muted }]}>{business?.moneda ?? 'Bs.'}</Text>
                    <TextInput
                      style={[styles.priceInput, { color: colors.text, borderBottomColor: colors.border }]}
                      value={editPrice}
                      onChangeText={setEditPrice}
                      accessibilityLabel={`Precio unitario del artículo ${index + 1}`}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  </View>
                  </View>
                  <Text style={[styles.unitLabel, { color: colors.muted }]}>Unidad: {item.unit}</Text>
                  <View style={styles.editorActions}>
                    <Pressable
                      style={[styles.editorSave, { backgroundColor: colors.primary }]}
                      onPress={() => saveItem(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Guardar artículo ${index + 1}`}
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
          <View style={styles.addProductButton}>
            <PrimaryButton
              title={proLocked?'Pro · Añadir producto':'+  Añadir producto'} icon={proLocked?'lock-closed-outline':undefined}
              onPress={() => {if(requestEdit())router.push(`/quotes/${quote.id}/add-item`);}}
            />
          </View>
        )}

        <View style={styles.totalRow}>
          <View />
          <Text style={[styles.totalValue, { color: colors.text }]}>
            Total {formatMoney(quote.total)}
          </Text>
        </View>

        {saveable && (
          <TutorialTarget id="options">
            <DocumentOptions values={{ showNotes, includeSignature, includeSeal }} disabled={saving || itemBusy}
              onToggle={key => {
                if (access === 'read_only' || access === 'checking') { requestEdit(); return; }
                if (key === 'showNotes') setShowNotes(!showNotes);
                else if (key === 'includeSignature') setIncludeSignature(!includeSignature);
                else setIncludeSeal(!includeSeal);
              }} />
          </TutorialTarget>
        )}

        {showNotes && saveable && (
          <View><Pressable accessibilityRole="button" onPress={() => {if(!canEdit)requestEdit();}} style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8}}>
            <Text style={[styles.toggleLabel,{color:colors.text}]}>Texto de las notas</Text>{proLocked&&<ProBadge/>}
          </Pressable><TextInput
            ref={notesInputRef}
            style={[
              styles.notesBox,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              notesInputStyle,
            ]}
            value={notes}
            editable={canEdit}
            onChangeText={setNotes}
            onFocus={revealNotes}
            onLayout={revealNotes}
            onContentSizeChange={revealNotes}
            onSelectionChange={revealNotes}
            accessibilityLabel="Texto de las notas adicionales"
            disableFullscreenUI
            placeholder="Notas adicionales"
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          /></View>
        )}

        <TutorialTarget id="preview" ><PrimaryButton
          title="Generar vista previa"
          onPress={() => { tutorial.notify('preview'); void openPreview(); }}
          loading={saving}
          disabled={itemBusy}
        /></TutorialTarget>
      </TutorialScrollView>

      {clientOpen && <DocumentClientModal initial={getDocumentClient(quote)}
        onSave={saveClientDetails} onClose={() => setClientOpen(false)} />}
      {dateOpen && <DatePickerModal title="Fecha de la cotización" value={quote.createdAt}
        onClose={() => setDateOpen(false)} onSave={saveDate} />}
      <ReorderItemsModal visible={ordering} items={quote.items} onClose={() => setOrdering(false)} onSave={reorderItems} />
    </KeyboardAvoidingView>
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
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 18,
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
  addProductButton: {
    marginTop: 16,
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
  nameInput: {
    borderBottomWidth: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    minHeight: 44,
    paddingBottom: 8,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  numericFields: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  quantityField: { flex: 1.25, minWidth: 0 },
  priceField: { flex: 1, minWidth: 0 },
  stepper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    flex: 1,
    borderBottomWidth: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    minWidth: 0,
    minHeight: 44,
    textAlign: 'center',
    paddingBottom: 4,
  },
  unitLabel: {
    fontSize: 12,
    fontFamily: 'Poppins',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    minHeight: 44,
  },
  pricePrefix: {
    fontSize: 14,
    fontFamily: 'Poppins',
    paddingBottom: 8,
  },
  priceInput: {
    flex: 1,
    borderBottomWidth: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    minWidth: 0,
    minHeight: 44,
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
  toggleLabel: {
    fontSize: 15,
    fontFamily: 'Poppins',
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

export const QuoteDetailScreen = withTutorial(QuoteDetailScreenContent, 'quote-detail');
