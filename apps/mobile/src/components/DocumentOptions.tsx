import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';

export interface DocumentOptionValues {
  showNotes: boolean;
  includeSignature: boolean;
  includeSeal: boolean;
}

const options = [
  { key: 'showNotes', label: 'Notas adicionales' },
  { key: 'includeSignature', label: 'Pie de firma' },
  { key: 'includeSeal', label: 'Incluir sello' },
] as const;

export function DocumentOptions({ values, onToggle, disabled = false, delivery = false }: {
  values: DocumentOptionValues;
  onToggle: (key: keyof DocumentOptionValues) => void;
  disabled?: boolean;
  delivery?: boolean;
}) {
  const { colors } = useTheme();
  return <View>
    {options.filter(option => !delivery || option.key === 'includeSeal').map(option => (
      <Pressable key={option.key} style={styles.row} onPress={() => onToggle(option.key)}
        disabled={disabled} accessibilityRole="checkbox" accessibilityLabel={option.label}
        accessibilityState={{ checked: values[option.key], disabled }}>
        <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
        <View style={[styles.check, { borderColor: colors.primary }, values[option.key] && { backgroundColor: colors.primary }]}>
          {values[option.key] && <Ionicons name="checkmark" size={14} color={colors.onPrimary} />}
        </View>
      </Pressable>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 44, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 15, fontFamily: 'Poppins', flex: 1 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
