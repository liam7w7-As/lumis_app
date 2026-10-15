import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormModal } from './FormModal';
import { PrimaryButton } from './PrimaryButton';
import { useTheme } from '../theme/ThemeContext';

type ReorderProps = {
  visible: boolean; items: { id: number; description: string }[];
  onClose: () => void; onSave: (ids: number[]) => Promise<void>;
};
export function ReorderItemsModal(props: ReorderProps) {
  return props.visible ? <ReorderForm {...props} /> : null;
}
function ReorderForm({ visible, items, onClose, onSave }: ReorderProps) {
  const { colors } = useTheme();
  const [order, setOrder] = useState(items);
  const [busy, setBusy] = useState(false);
  const move = (index: number, delta: number) => {
    setOrder((prev) => {
      const next = [...prev], target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try { await onSave(order.map((item) => item.id)); onClose(); }
    catch (err) { Alert.alert('No se pudo guardar el orden', err instanceof Error ? err.message : 'Intenta de nuevo'); }
    finally { setBusy(false); }
  };
  return <FormModal visible={visible} title="Ordenar productos" onClose={() => { if (!busy) onClose(); }}>
    <Text style={{ color: colors.muted }}>Usa las flechas para elegir el orden del documento y del PDF.</Text>
    {order.map((item,index) => <View key={item.id} style={[styles.row, { borderColor: colors.border }]}>
      <Text style={[styles.name, { color: colors.text }]}>{index + 1}. {item.description}</Text>
      {([-1,1] as const).map((delta) => {
        const disabled = busy || (delta === -1 ? index === 0 : index === order.length - 1);
        return <Pressable key={delta} onPress={() => move(index,delta)} disabled={disabled}
          accessibilityLabel={(delta === -1 ? 'Subir ' : 'Bajar ') + item.description}
          style={[styles.button, { opacity: disabled ? 0.25 : 1 }]}>
          <Ionicons name={delta === -1 ? 'arrow-up' : 'arrow-down'} size={22} color={colors.primary} />
        </Pressable>;
      })}
    </View>)}
    <PrimaryButton title="Guardar orden" onPress={save} loading={busy} />
  </FormModal>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  name: { flex: 1, fontSize: 14 }, button: { padding: 10 },
});
