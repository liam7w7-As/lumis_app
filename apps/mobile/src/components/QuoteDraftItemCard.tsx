import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { DraftItem } from '../context/DraftContext';
import { useBusiness, useMoney } from '../context/BusinessContext';
import { useTheme } from '../theme/ThemeContext';
import { IS_NOVALED } from '../lib/backend';
import {
  parseQuoteDraftDecimal, quoteDraftErrors, quoteDraftNameLimit, quoteDraftNumberText, quoteDraftSubtotal,
  type QuoteDraftField,
} from '../lib/quoteDraftEditing';

interface QuoteDraftItemCardProps {
  item: DraftItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  showErrors?: boolean;
  onChange: (patch: Partial<Omit<DraftItem, 'key'>>) => void;
  onRemove: () => void;
  onChooseUnit: () => void;
  onInputFocus?: (input: TextInput) => void;
  focusRequest?: { field: QuoteDraftField; requestId: number };
}

export function QuoteDraftItemCard({ item, index, expanded, onToggle, disabled = false, showErrors = false,
  onChange, onRemove, onChooseUnit, onInputFocus, focusRequest }: QuoteDraftItemCardProps) {
  const { colors } = useTheme();
  const money = useMoney();
  const { business } = useBusiness();
  const nameInput = useRef<TextInput>(null);
  const quantityInput = useRef<TextInput>(null);
  const priceInput = useRef<TextInput>(null);
  const marcaInput = useRef<TextInput>(null);
  const procedenciaInput = useRef<TextInput>(null);
  const chooseUnit = useRef(onChooseUnit);
  const appliedFocus = useRef<number | undefined>(undefined);
  const [focused, setFocused] = useState<QuoteDraftField | null>(null);
  const [touched, setTouched] = useState<Partial<Record<QuoteDraftField, boolean>>>({});
  const [reviewed, setReviewed] = useState(false);
  const errors = quoteDraftErrors(item);
  const subtotal = quoteDraftSubtotal(item);
  const number = index + 1;
  const focusField = focusRequest?.field;
  const focusRequestId = focusRequest?.requestId;
  useEffect(() => { chooseUnit.current = onChooseUnit; }, [onChooseUnit]);
  useEffect(() => {
    if (!expanded || disabled || focusField === undefined || focusRequestId === undefined || appliedFocus.current === focusRequestId) return;
    appliedFocus.current = focusRequestId;
    if (focusField === 'unit') chooseUnit.current();
    else ({ name: nameInput, quantity: quantityInput, unitPrice: priceInput }[focusField]).current?.focus();
  }, [expanded, disabled, focusField, focusRequestId]);
  const focus = (field: QuoteDraftField, input: TextInput | null) => {
    setFocused(field);
    if (input) onInputFocus?.(input);
  };
  const blur = (field: QuoteDraftField) => {
    if (field === 'unitPrice' && item.fromScan && !quoteDraftNumberText(item, 'unitPrice').trim())
      onChange({ unitPrice: 0, unitPriceText: '0' });
    setFocused(null);
    setTouched(previous => ({ ...previous, [field]: true }));
  };
  const error = (field: QuoteDraftField) => (showErrors || reviewed || touched[field]) ? errors[field] : undefined;
  const border = (field: QuoteDraftField) => error(field) ? colors.error : focused === field ? colors.primary : colors.border;
  const numericChange = (field: 'quantity' | 'unitPrice', text: string) => {
    const parsed = parseQuoteDraftDecimal(text);
    onChange({ [field === 'quantity' ? 'quantityText' : 'unitPriceText']: text,
      ...(parsed !== null ? { [field]: parsed } : {}) });
  };
  const finish = () => {
    const invalid = (['name', 'quantity', 'unitPrice', 'unit'] as const).find(field => errors[field]);
    if (invalid) {
      setReviewed(true);
      if (invalid === 'unit') onChooseUnit();
      else ({ name: nameInput, quantity: quantityInput, unitPrice: priceInput }[invalid]).current?.focus();
      return;
    }
    onToggle();
  };
  const price = parseQuoteDraftDecimal(quoteDraftNumberText(item, 'unitPrice'));
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Pressable onPress={onToggle} disabled={disabled} accessibilityRole="button"
        accessibilityLabel={`Editar artículo ${number}`} accessibilityState={{ expanded, disabled }}>
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.onPrimary }]}>{number}</Text>
          </View>
          <View style={styles.heading}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{item.name.trim() || `Artículo ${number}`}</Text>
            <Text style={[styles.detail, { color: colors.muted }]}>
              {quoteDraftNumberText(item, 'quantity') || '—'} x {price === null ? '—' : money(price)}
            </Text>
          </View>
          <Text style={[styles.subtotal, { color: colors.text }]}>{subtotal === null ? '—' : money(subtotal)}</Text>
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-back'} size={18} color={colors.muted} />
        </View>
      </Pressable>
      {!expanded && (showErrors || reviewed) && Object.keys(errors).length > 0 &&
        <Text style={[styles.error, { color: colors.error }]}>Revisa los datos de este artículo.</Text>}
      {expanded && <View style={styles.editor}>
      {item.createProduct && item.productId == null && <Text style={[styles.newLabel, { color: colors.primary }]}>Nuevo · Se creará al guardar</Text>}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>Nombre del artículo</Text>
        <TextInput ref={nameInput} value={item.name} onChangeText={name => onChange({ name })}
          editable={!disabled} accessibilityLabel={`Nombre del artículo ${number}`}
          accessibilityHint={error('name')} placeholder="Nombre del artículo" placeholderTextColor={colors.muted}
          multiline maxLength={quoteDraftNameLimit(item)} autoCapitalize="sentences" autoCorrect={false}
          submitBehavior="blurAndSubmit" returnKeyType="next" onSubmitEditing={() => quantityInput.current?.focus()}
          onFocus={() => focus('name', nameInput.current)} onBlur={() => blur('name')}
          style={[styles.input, styles.nameInput, { color: colors.text, borderBottomColor: border('name') }]} />
        {!!error('name') && <Text style={[styles.error, { color: colors.error }]}>{error('name')}</Text>}
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>Marca (opcional)</Text>
        <TextInput ref={marcaInput} value={item.marca ?? ''} onChangeText={marca => onChange({ marca })}
          editable={!disabled} accessibilityLabel={`Marca del artículo ${number}`} maxLength={IS_NOVALED ? 150 : 100}
          multiline autoCorrect={false} submitBehavior="blurAndSubmit" returnKeyType="done"
          onFocus={() => { if (marcaInput.current) onInputFocus?.(marcaInput.current); }}
          style={[styles.input, styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]} />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>Procedencia (opcional)</Text>
        <TextInput ref={procedenciaInput} value={item.procedencia ?? ''} onChangeText={procedencia => onChange({ procedencia })}
          editable={!disabled} accessibilityLabel={`Procedencia del artículo ${number}`} maxLength={IS_NOVALED ? 150 : 100}
          multiline autoCorrect={false} submitBehavior="blurAndSubmit" returnKeyType="done"
          onFocus={() => { if (procedenciaInput.current) onInputFocus?.(procedenciaInput.current); }}
          style={[styles.input, styles.nameInput, { color: colors.text, borderBottomColor: colors.border }]} />
      </View>
      <View style={styles.values}>
        <View style={[styles.field, styles.quantity]}>
          <Text style={[styles.label, { color: colors.muted }]}>Cantidad</Text>
          <View style={styles.quantityRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Disminuir cantidad del artículo ${number}`}
            disabled={disabled} style={[styles.stepper, { borderColor: colors.border }]} onPress={() => {
              const value = parseQuoteDraftDecimal(quoteDraftNumberText(item, 'quantity'));
              if (value !== null && value > 1) numericChange('quantity', String(Math.round((value - 1) * 100) / 100));
            }}><Ionicons name="remove" size={18} color={colors.text} /></Pressable>
          <TextInput ref={quantityInput} value={quoteDraftNumberText(item, 'quantity')}
            onChangeText={text => numericChange('quantity', text)} keyboardType="decimal-pad" selectTextOnFocus
            editable={!disabled} accessibilityLabel={`Cantidad del artículo ${number}`} accessibilityHint={error('quantity')}
            maxLength={13} returnKeyType="next" onSubmitEditing={() => priceInput.current?.focus()}
            onFocus={() => focus('quantity', quantityInput.current)} onBlur={() => blur('quantity')}
            style={[styles.input, styles.quantityInput, { color: colors.text, borderBottomColor: border('quantity') }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar cantidad del artículo ${number}`}
            disabled={disabled} style={[styles.stepper, { borderColor: colors.border }]} onPress={() => {
              const value = parseQuoteDraftDecimal(quoteDraftNumberText(item, 'quantity'));
              if (value !== null) numericChange('quantity', String(Math.round((value + 1) * 100) / 100));
            }}><Ionicons name="add" size={18} color={colors.text} /></Pressable>
          </View>
          {!!error('quantity') && <Text style={[styles.error, { color: colors.error }]}>{error('quantity')}</Text>}
        </View>
        <View style={[styles.field, styles.price]}>
          <Text style={[styles.label, { color: colors.muted }]}>Precio</Text>
          <View style={styles.priceRow}>
          <Text style={[styles.detail, { color: colors.muted }]}>{business?.moneda ?? 'Bs.'}</Text>
          <TextInput ref={priceInput} value={quoteDraftNumberText(item, 'unitPrice')}
            onChangeText={text => numericChange('unitPrice', text)} keyboardType="decimal-pad" selectTextOnFocus
            editable={!disabled} accessibilityLabel={`Precio unitario del artículo ${number}`} accessibilityHint={error('unitPrice')}
            maxLength={15} returnKeyType="done"
            onFocus={() => focus('unitPrice', priceInput.current)} onBlur={() => blur('unitPrice')}
            style={[styles.input, styles.priceInput, { color: colors.text, borderBottomColor: border('unitPrice') }]} />
          </View>
          {!!error('unitPrice') && <Text style={[styles.error, { color: colors.error }]}>{error('unitPrice')}</Text>}
        </View>
      </View>
      <Pressable disabled={disabled} onPress={onChooseUnit} accessibilityRole="button"
        accessibilityLabel={`Unidad del artículo ${number}`} accessibilityValue={{ text: item.unit || 'Seleccionar' }}
        accessibilityState={{ disabled }} style={styles.unitButton}>
        <Text numberOfLines={1} style={[styles.detail, { color: error('unit') ? colors.error : colors.muted }]}>Unidad: {item.unit || 'Elegir'}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.muted} />
      </Pressable>
      {!!error('unit') && <Text style={[styles.error, { color: colors.error }]}>{error('unit')}</Text>}
      <View style={styles.actions}>
        <Pressable disabled={disabled} onPress={finish} accessibilityRole="button" accessibilityLabel={`Guardar artículo ${number}`}
          style={[styles.save, { backgroundColor: colors.primary }]}>
          <Text style={[styles.saveText, { color: colors.onPrimary }]}>Guardar</Text>
        </Pressable>
        <Pressable onPress={onRemove} disabled={disabled} accessibilityRole="button"
          accessibilityLabel={`Eliminar artículo ${number}`} accessibilityState={{ disabled }} hitSlop={8} style={styles.remove}>
          <Ionicons name="trash-outline" size={22} color={colors.error} />
        </Pressable>
      </View>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 14 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: 'Poppins', fontSize: 15, fontWeight: '700' },
  heading: { flex: 1, gap: 2 },
  name: { fontFamily: 'Poppins', fontSize: 15, fontWeight: '700' },
  detail: { fontFamily: 'Poppins', fontSize: 12 },
  newLabel: { fontFamily: 'Poppins', fontSize: 10, lineHeight: 15 },
  editor: { marginTop: 12, gap: 10 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 2, minWidth: 0 },
  label: { fontFamily: 'Poppins', fontSize: 13 },
  input: { borderBottomWidth: 1, minHeight: 44, paddingBottom: 8,
    fontFamily: 'Poppins', fontSize: 14, includeFontPadding: false },
  nameInput: { maxHeight: 130, textAlignVertical: 'top', fontSize: 16, lineHeight: 24 },
  values: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  quantity: { flex: 1.25 },
  price: { flex: 1 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  quantityInput: { flex: 1, minWidth: 0, textAlign: 'center' },
  stepper: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceInput: { flex: 1, minWidth: 0 },
  unitButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
  error: { fontFamily: 'Poppins', fontSize: 10, lineHeight: 15 },
  subtotal: { fontFamily: 'Poppins', fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  save: { minHeight: 44, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: 'Poppins', fontSize: 14, fontWeight: '700' },
});
