import { TutorialTarget, TutorialScrollView, TutorialHelpButton, useTutorialAvailability, withTutorial } from '../tutorials/TutorialElements';
import { useTutorial } from '../tutorials/TutorialContext';
import { FormModal } from '../components/FormModal';
import { feedback } from '../lib/feedback';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLegacyPending } from '../hooks/useLegacyPending';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ScrollView,
  type TextInput,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDraft, type DraftItem } from '../context/DraftContext';
import { useTheme } from '../theme/ThemeContext';
import { ApiError, api, type Branch } from '../lib/api';
import { useMoney } from '../context/BusinessContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { MagicQuoteScanModal } from '../components/MagicQuoteScanModal';
import { useLicense } from '../context/LicenseContext';
import { useReducedMotion } from '../context/MotionContext';
import { QuoteDraftItemCard } from '../components/QuoteDraftItemCard';
import { buildQuoteItems, quoteDraftSubtotal, QuoteDraftValidationError, type QuoteDraftField } from '../lib/quoteDraftEditing';
import { DEFAULT_UNITS, loadUnits } from '../lib/units';

function todayLabel(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function NewQuoteScreenContent() {
  useTutorialAvailability({ ready: true });
  const tutorial = useTutorial();

  const { user, token } = useAuth();
  const { refresh: refreshLicense } = useLicense();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const formatMoney = useMoney();
  const insets = useSafeAreaInsets();
  const { client, setClient, items, addItem, updateItem, removeItem, clear } = useDraft();
  const latestItems = useRef(items);
  useLayoutEffect(() => { latestItems.current = items; }, [items]);
  const scroll = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const focusedInput = useRef<TextInput | null>(null);
  const focusSequence = useRef(0);
  const [focusRequest, setFocusRequest] = useState<{ key: string; field: QuoteDraftField; requestId: number } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);
  const [unitItemKey, setUnitItemKey] = useState<string | null>(null);
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS);
  const [nextNumber, setNextNumber] = useState<number | string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const submitLock=useRef(false);
  const pending = useLegacyPending('/api/quotes');
  const restored = useRef<unknown>(null);
  const keepFocusedVisible = useCallback(() => {
    const input = focusedInput.current;
    if (!input?.isFocused() || !scroll.current) return;
    input.measureInWindow((_x, y, _width, height) => {
      scroll.current?.getNativeScrollRef()?.measureInWindow((_sx, top, _sw, viewportHeight) => {
        const bottom = Math.min(top + viewportHeight, Keyboard.metrics()?.screenY ?? Infinity) - 24;
        if (y + height > bottom) scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + y + height - bottom), animated: !reducedMotion });
        else if (y < top + 20) scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + y - top - 20), animated: !reducedMotion });
      });
    });
  }, [reducedMotion]);
  const focusInput = useCallback((input: TextInput) => {
    focusedInput.current = input;
    requestAnimationFrame(keepFocusedVisible);
  }, [keepFocusedVisible]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', keepFocusedVisible);
    const changed = Keyboard.addListener('keyboardDidChangeFrame', keepFocusedVisible);
    return () => { shown.remove(); changed.remove(); };
  }, [keepFocusedVisible]);
  const editItem = (key: string, patch: Partial<Omit<DraftItem, 'key'>>) => {
    if (saving || pending || submitLock.current) return;
    latestItems.current = latestItems.current.map(item => item.key === key ? { ...item, ...patch } : item);
    updateItem(key, patch);
  };
  const deleteItem = (key: string) => {
    if (saving || pending || submitLock.current) return;
    latestItems.current = latestItems.current.filter(item => item.key !== key);
    removeItem(key);
  };
  const chooseUnit = (key: string) => {
    if (saving || pending || submitLock.current) return;
    Keyboard.dismiss();
    setUnitItemKey(key);
    void loadUnits(user?.id ?? null).then(setUnits);
  };
  useEffect(() => {
    if (!pending || saving || restored.current === pending.body.solicitud_id || !token) return;
    restored.current = pending.body.solicitud_id;
    const body = pending.body as unknown as Parameters<typeof api.createQuote>[0];
    void Promise.resolve().then(async () => {
      clear(); setBranchId(body.branchId);
      for (const item of body.items) addItem({ productId: item.productId ?? null, name: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, marca: item.marca ?? null, procedencia: item.procedencia ?? null, createProduct: item.createProduct,
        ...(item.fromScan ? { fromScan: true, ...(item.quantity === 0 ? { quantityText: '' } : {}) } : {}) });
      if (body.clientId) { const result = await api.clients(token, { id: body.clientId }); setClient(result.clients.find(item => item.id === body.clientId) ?? null); }
    }).catch(() => {});
  }, [pending, saving, token, clear, addItem, setClient]);

  useEffect(() => {
    if (!token) return;
    api
      .nextQuoteNumber(token)
      .then((r) => setNextNumber(r.nextNumber))
      .catch(() => {});
    api
      .branches(token)
      .then((r) => {
        setBranches(r.branches);
        if (r.branches.length > 0) {
          setBranchId((current) => current ?? r.branches[0].id);
        }
      })
      .catch(() => {});
  }, [token]);

  const branch = branches.find((b) => b.id === branchId) ?? null;

  const subtotals = items.map(quoteDraftSubtotal);
  const total = subtotals.some(value => value === null) ? null
    : Math.round(subtotals.reduce<number>((sum, value) => sum + (value ?? 0), 0) * 100) / 100;
  const unitItem = items.find(item => item.key === unitItemKey);
  const unitOptions = [...new Set([unitItem?.unit, ...units].filter((unit): unit is string => !!unit))];

  const save = async () => {
    if (!token || submitLock.current) return;
    if (!pending && latestItems.current.length === 0) {
      feedback.alert('Sin artículos', 'Agrega al menos un artículo a la cotización');
      return;
    }
    let preparedItems: ReturnType<typeof buildQuoteItems> = [];
    if (!pending) {
      try { preparedItems = buildQuoteItems(latestItems.current); }
      catch (error) {
        setShowErrors(true);
        const message = error instanceof Error ? error.message : 'Revisa los datos de los artículos.';
        const focusError = () => {
          if (error instanceof QuoteDraftValidationError && latestItems.current.some(item => item.key === error.key)) {
            setExpandedItemKey(error.key);
            setFocusRequest({ key: error.key, field: error.field, requestId: ++focusSequence.current });
          }
        };
        feedback.alert('Revisa los artículos', message, [{ text: 'Revisar', onPress: focusError }], { onDismiss: focusError });
        return;
      }
    }
    Keyboard.dismiss();
    submitLock.current=true;
    setSaving(true);
    try {
      const { quote } = await api.createQuote(
        pending ? { ...pending.body, solicitud_id: undefined } as unknown as Parameters<typeof api.createQuote>[0] : {
          clientId: client?.id ?? null,
          branchId,
          items: preparedItems,
        },
        token,
      );
      clear();
      router.replace(`/quotes/${quote.id}/preview?created=1`);
    } catch (err) {
      feedback.alert('Error', err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      submitLock.current=false;
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TutorialScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }}
        onLayout={() => requestAnimationFrame(keepFocusedVisible)}
        onContentSizeChange={() => requestAnimationFrame(keepFocusedVisible)}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 8, paddingBottom: 32 + insets.bottom },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>Nueva cotización</Text>
          <View style={styles.headerActions}><TutorialHelpButton />
            <TutorialTarget id="save" ><Pressable
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
            </Pressable></TutorialTarget>
          </View>
        </View>

        {pending && !saving && <Text style={{ color: colors.muted, fontFamily: 'Poppins', marginVertical: 12 }}>Envío pendiente. Pulsa Guardar para confirmar esta misma cotización.</Text>}
        {/* Keep the native parent stable when saving disables touches on the form. */}
        <View collapsable={false} style={styles.formContent} pointerEvents={pending || saving ? 'none' : 'auto'}>
        <View style={styles.metaRow}>
          <View style={styles.dateWrap}>
            <Text style={[styles.dateText, { color: colors.muted }]}>Fecha {todayLabel()}</Text>
            <Pressable onPress={() => feedback.alert('Fecha', 'Próximamente')} hitSlop={8}>
              <Ionicons name="pencil-outline" size={14} color={colors.muted} />
            </Pressable>
          </View>
          {nextNumber !== null && (
            <Text style={[styles.numberText, { color: colors.muted }]}>
              COTIZACIÓN Nº {nextNumber}
            </Text>
          )}
        </View>

        <TutorialTarget id="seller" ><View style={[styles.vendorCard, { backgroundColor: colors.surface }]}>
          <View style={styles.vendorBlock}>
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Vendedor</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="person-outline" size={16} color={colors.muted} />
              <Text style={[styles.vendorName, { color: colors.muted }]} numberOfLines={1}>
                {(user?.name ?? user?.username ?? '').toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.vendorBlock} onPress={() => setBranchesOpen(true)}>
            <Text style={[styles.vendorLabel, { color: colors.text }]}>Sucursal</Text>
            <View style={styles.vendorValue}>
              <Ionicons name="storefront-outline" size={16} color={colors.muted} />
              <Text style={[styles.vendorName, { color: colors.muted }]} numberOfLines={1}>
                {branch?.name ?? 'Seleccionar'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </View>
          </Pressable>
        </View></TutorialTarget>

        {client ? (
          <TutorialTarget id="client" ><View style={[styles.clientCard, { backgroundColor: colors.surface }]}>
            <View style={styles.clientInfo}>
              <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
                {client.name}
              </Text>
              {[client.phone, client.email].filter(Boolean).join('  ·  ') !== '' && (
                <Text style={[styles.clientDetail, { color: colors.muted }]} numberOfLines={1}>
                  {[client.phone, client.email].filter(Boolean).join('  ·  ')}
                </Text>
              )}
            </View>
            <Pressable onPress={() => setClient(null)} hitSlop={10}>
              <Ionicons name="close-outline" size={22} color={colors.muted} />
            </Pressable>
          </View></TutorialTarget>
        ) : (
          <TutorialTarget id="client" ><PrimaryButton
            title="+  Añadir cliente"
            style={styles.actionButton}
            onPress={() => { tutorial.notify('client'); router.push('/quotes/new/client'); }}
          /></TutorialTarget>
        )}

        {items.map((item, index) => (
          <QuoteDraftItemCard key={item.key} item={item} index={index} disabled={saving || !!pending}
            expanded={expandedItemKey === item.key} onToggle={() => {
              Keyboard.dismiss(); setExpandedItemKey(previous => previous === item.key ? null : item.key);
            }}
            showErrors={showErrors} focusRequest={focusRequest?.key === item.key ? focusRequest : undefined}
            onChange={patch => editItem(item.key, patch)} onRemove={() => deleteItem(item.key)}
            onChooseUnit={() => chooseUnit(item.key)} onInputFocus={focusInput} />
        ))}

        <TutorialTarget id="products" ><Pressable
          style={[styles.actionButton, styles.outlineButton, { borderColor: colors.primary }]}
          onPress={() => { tutorial.notify('product'); router.push('/quotes/new/item'); }}
        >
          <Text style={[styles.outlineText, { color: colors.primary }]}>+  Añadir artículo</Text>
        </Pressable></TutorialTarget>

        <TutorialTarget id="scan"><Pressable
          accessibilityRole="button" accessibilityLabel="Escaneo mágico de una lista de productos"
          disabled={saving || !!pending}
          onPress={() => { tutorial.notify('scan'); setScanOpen(true); }}
          style={[styles.scanButton, { backgroundColor: colors.primary + '12', borderColor: colors.primary, opacity: saving || pending ? 0.5 : 1 }]}
        >
          <Ionicons name="sparkles-outline" size={24} color={colors.primary} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.scanTitle, { color: colors.primary }]}>Escaneo mágico</Text>
            <Text style={[styles.scanCaption, { color: colors.muted }]}>Convierte una foto de tu lista en artículos</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable></TutorialTarget>

        {items.length > 0 && (
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.muted }]}>TOTAL</Text>
            <Text style={[styles.totalValue, { color: colors.text }]}>
              {total === null ? '—' : formatMoney(total)}
            </Text>
          </View>
        )}
        <PrimaryButton title="Guardar y ver PDF" onPress={() => { void save(); }} loading={saving} disabled={items.length===0}/>
        </View>
      </TutorialScrollView>

      {token && <MagicQuoteScanModal key={token} visible={scanOpen} token={token}
        maxItems={Math.max(0, 200 - items.length)}
        onClose={() => { setScanOpen(false); void refreshLicense(); }}
        onAdd={lines => {
          if (items.length + lines.length > 200) throw new Error('La cotización admite hasta 200 artículos. Desmarca algunos productos para continuar.');
          lines.forEach(line => addItem(line));
          void refreshLicense();
        }} />}

      <FormModal visible={!!unitItem} title="Unidad de medida" icon="resize-outline" onClose={() => setUnitItemKey(null)}>
        {unitOptions.map(option => <Pressable key={option} accessibilityRole="button"
          accessibilityLabel={`Usar unidad ${option}`} accessibilityState={{ selected: option === unitItem?.unit }}
          style={styles.optionRow} onPress={() => {
            if (unitItemKey) editItem(unitItemKey, { unit: option });
            setUnitItemKey(null);
          }}>
          <Text style={[styles.optionText, { color: option === unitItem?.unit ? colors.primary : colors.text }]}>{option}</Text>
          {option === unitItem?.unit && <Ionicons name="checkmark" size={18} color={colors.primary} />}
        </Pressable>)}
      </FormModal>

      <FormModal visible={branchesOpen} title="Elegir sucursal" icon="storefront-outline" onClose={() => setBranchesOpen(false)}>

            {branches.map((option) => (
              <Pressable
                key={option.id}
                style={styles.optionRow}
                onPress={() => {
                  setBranchId(option.id);
                  setBranchesOpen(false);
                }}
              >
                <View>
                  <Text
                    style={[
                      styles.optionText,
                      { color: option.id === branchId ? colors.primary : colors.text },
                      option.id === branchId && styles.optionSelected,
                    ]}
                  >
                    {option.name}
                  </Text>
                  {option.address && (
                    <Text style={[styles.optionSub, { color: colors.muted }]}>
                      {option.address}
                    </Text>
                  )}
                </View>
                {option.id === branchId && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </Pressable>
            ))}
      </FormModal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 14,
  },
  formContent: {
    gap: 16,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  circleButton: {
    minWidth: 76,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  numberText: {
    fontSize: 13,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  vendorCard: {
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
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  clientInfo: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  clientDetail: {
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  actionButton: {
    borderRadius: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
  scanButton: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderWidth: 1, borderRadius: 16 },
  scanTitle: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
  scanCaption: { fontFamily: 'Poppins', fontSize: 11, lineHeight: 17 },
  outlineButton: {
    borderWidth: 1.5,
    paddingVertical: 16,
    alignItems: 'center',
  },
  outlineText: {
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '700',
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 22,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  optionsCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  optionsTitle: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  optionText: {
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  optionSelected: {
    fontWeight: '700',
  },
  optionSub: {
    fontSize: 12,
    fontFamily: 'Poppins',
    marginTop: 2,
  },
});

export const NewQuoteScreen = withTutorial(NewQuoteScreenContent, 'quote-create');
