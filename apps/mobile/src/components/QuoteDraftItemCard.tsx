import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { DraftItem } from '../context/DraftContext';
import { useMoney } from '../context/BusinessContext';
import { useTheme } from '../theme/ThemeContext';
import {
  parseQuoteDraftDecimal, quoteDraftErrors, quoteDraftNameLimit, quoteDraftNumberText, quoteDraftSubtotal,
  type QuoteDraftField,
} from '../lib/quoteDraftEditing';

interface QuoteDraftItemCardProps {
  item: DraftItem;
  index: number;
  disabled?: boolean;
  showErrors?: boolean;
  onChange: (patch: Partial<Omit<DraftItem, 'key'>>) => void;
  onRemove: () => void;
  onChooseUnit: () => void;
  onInputFocus?: (input: TextInput) => void;
  focusRequest?: { field: QuoteDraftField; requestId: number };
}

export function QuoteDraftItemCard({ item, index, disabled = false, showErrors = false,
  onChange, onRemove, onChooseUnit, onInputFocus, focusRequest }: QuoteDraftItemCardProps) {
  const { colors } = useTheme();
  const money = useMoney();
  const nameInput = useRef<TextInput>(null);
  const quantityInput = useRef<TextInput>(null);
  const priceInput = useRef<TextInput>(null);
  const chooseUnit = useRef(onChooseUnit);
  const appliedFocus = useRef<number | undefined>(undefined);
  const [focused, setFocused] = useState<QuoteDraftField | null>(null);
  const [touched, setTouched] = useState<Partial<Record<QuoteDraftField, boolean>>>({});
  const errors = quoteDraftErrors(item);
  const subtotal = quoteDraftSubtotal(item);
  const number = index + 1;
  const focusField = focusRequest?.field;
  const focusRequestId = focusRequest?.requestId;
  useEffect(() => { chooseUnit.current = onChooseUnit; }, [onChooseUnit]);
  useEffect(() => {
    if (disabled || focusField === undefined || focusRequestId === undefined || appliedFocus.current === focusRequestId) return;
    appliedFocus.current = focusRequestId;
    if (focusField === 'unit') chooseUnit.current();
    else ({ name: nameInput, quantity: quantityInput, unitPrice: priceInput }[focusField]).current?.focus();
  }, [disabled, focusField, focusRequestId]);
  const focus = (field: QuoteDraftField, input: TextInput | null) => {
    setFocused(field);
    if (input) onInputFocus?.(input);
  };
  const blur = (field: QuoteDraftField) => {
    setFocused(null);
    setTouched(previous => ({ ...previous, [field]: true }));
  };
  const error = (field: QuoteDraftField) => (showErrors || touched[field]) ? errors[field] : undefined;
  const border = (field: QuoteDraftField) => error(field) ? colors.error : focused === field ? colors.primary : colors.border;
  const numericChange = (field: 'quantity' | 'unitPrice', text: string) => {
    const parsed = parseQuoteDraftDecimal(text);
    onChange({ [field === 'quantity' ? 'quantityText' : 'unitPriceText']: text,
      ...(parsed !== null ? { [field]: parsed } : {}) });
  };
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>Artículo {number}</Text>
          {item.createProduct && item.productId == null && <Text style={[styles.newLabel, { color: colors.primary }]}>Nuevo · Se creará al guardar</Text>}
        </View>
        <Pressable onPress={onRemove} disabled={disabled} accessibilityRole="button"
          accessibilityLabel={`Eliminar artículo ${number}`} accessibilityState={{ disabled }}
          hitSlop={4} style={({ pressed }) => [styles.remove, { backgroundColor: colors.background, opacity: pressed || disabled ? 0.5 : 1 }]}>
          <Ionicons name="trash-outline" size={19} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>Nombre del artículo</Text>
        <TextInput ref={nameInput} value={item.name} onChangeText={name => onChange({ name })}
          editable={!disabled} accessibilityLabel={`Nombre del artículo ${number}`}
          accessibilityHint={error('name')} placeholder="Nombre del artículo" placeholderTextColor={colors.muted}
          multiline maxLength={quoteDraftNameLimit(item)} autoCapitalize="sentences" autoCorrect={false}
          submitBehavior="blurAndSubmit" returnKeyType="next" onSubmitEditing={() => quantityInput.current?.focus()}
          onFocus={() => focus('name', nameInput.current)} onBlur={() => blur('name')}
          style={[styles.input, styles.nameInput, { color: colors.text, backgroundColor: colors.background, borderColor: border('name') }]} />
        {!!error('name') && <Text style={[styles.error, { color: colors.error }]}>{error('name')}</Text>}
      </View>
      <View style={styles.values}>
        <View style={[styles.field, styles.quantity]}>
          <Text style={[styles.label, { color: colors.muted }]}>Cantidad</Text>
          <TextInput ref={quantityInput} value={quoteDraftNumberText(item, 'quantity')}
            onChangeText={text => numericChange('quantity', text)} keyboardType="decimal-pad" selectTextOnFocus
            editable={!disabled} accessibilityLabel={`Cantidad del artículo ${number}`} accessibilityHint={error('quantity')}
            maxLength={13} returnKeyType="next" onSubmitEditing={() => priceInput.current?.focus()}
            onFocus={() => focus('quantity', quantityInput.current)} onBlur={() => blur('quantity')}
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: border('quantity') }]} />
          {!!error('quantity') && <Text style={[styles.error, { color: colors.error }]}>{error('quantity')}</Text>}
        </View>
        <View style={[styles.field, styles.unit]}>
          <Text style={[styles.label, { color: colors.muted }]}>Unidad</Text>
          <Pressable disabled={disabled} onPress={onChooseUnit} accessibilityRole="button"
            accessibilityLabel={`Unidad del artículo ${number}`} accessibilityValue={{ text: item.unit || 'Seleccionar' }}
            accessibilityState={{ disabled }} style={({ pressed }) => [styles.input, styles.unitButton,
              { backgroundColor: colors.background, borderColor: border('unit'), opacity: pressed ? 0.7 : 1 }]}>
            <Text numberOfLines={1} style={[styles.unitText, { color: item.unit ? colors.text : colors.muted }]}>{item.unit || 'Elegir'}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.muted} />
          </Pressable>
          {!!error('unit') && <Text style={[styles.error, { color: colors.error }]}>{error('unit')}</Text>}
        </View>
        <View style={[styles.field, styles.price]}>
          <Text style={[styles.label, { color: colors.muted }]}>Precio unitario</Text>
          <TextInput ref={priceInput} value={quoteDraftNumberText(item, 'unitPrice')}
            onChangeText={text => numericChange('unitPrice', text)} keyboardType="decimal-pad" selectTextOnFocus
            editable={!disabled} accessibilityLabel={`Precio unitario del artículo ${number}`} accessibilityHint={error('unitPrice')}
            maxLength={15} returnKeyType="done"
            onFocus={() => focus('unitPrice', priceInput.current)} onBlur={() => blur('unitPrice')}
            style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: border('unitPrice') }]} />
          {!!error('unitPrice') && <Text style={[styles.error, { color: colors.error }]}>{error('unitPrice')}</Text>}
        </View>
      </View>
      <View style={[styles.footer, { borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Subtotal</Text>
        <Text style={[styles.subtotal, { color: colors.text }]}>{subtotal === null ? '—' : money(subtotal)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { flex: 1, gap: 2 },
  eyebrow: { fontFamily: 'Poppins-SemiBold', fontSize: 12 },
  newLabel: { fontFamily: 'Poppins', fontSize: 10, lineHeight: 15 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  field: { gap: 5, minWidth: 0 },
  label: { fontFamily: 'Poppins', fontSize: 10, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 10, paddingVertical: 10,
    fontFamily: 'Poppins', fontSize: 14, includeFontPadding: false },
  nameInput: { minHeight: 48, maxHeight: 130, textAlignVertical: 'top', fontFamily: 'Poppins-SemiBold', lineHeight: 21 },
  values: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  quantity: { flex: 0.8 },
  unit: { flex: 1 },
  price: { flex: 1.2 },
  unitButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unitText: { flex: 1, minWidth: 0, fontFamily: 'Poppins', fontSize: 12 },
  error: { fontFamily: 'Poppins', fontSize: 10, lineHeight: 15 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  subtotal: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
});
