import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';

export function PdfPaymentOption({ checked, onChange, disabled = false }: {
  checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel="Mostrar abonos y saldo en el PDF"
    accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onChange(!checked)} style={styles.row}>
    <Text style={[styles.label, { color: colors.text }]}>Mostrar abonos y saldo en el PDF</Text>
    <View style={[styles.check, { borderColor: colors.primary, backgroundColor: checked ? colors.primary : 'transparent' }]}>
      {checked && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 15, fontFamily: 'Poppins', flex: 1 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
