import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';

export type DeliverySignature = { mode: 'asesor' | 'otro' | 'sin_nombre'; name: string };

export function DeliverySignatureOptions({ value, onChange, disabled = false, error }: {
  value: DeliverySignature;
  onChange: (value: DeliverySignature) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const { colors } = useTheme();
  return <View style={styles.group}>
    <Text style={[styles.title, { color: colors.text }]}>Entregué conforme</Text>
    {([
      { mode: 'asesor', label: 'Nombre del asesor' },
      { mode: 'otro', label: 'Escribir otro nombre' },
      { mode: 'sin_nombre', label: 'Sin nombre' },
    ] as const).map(option => <Pressable key={option.mode} accessibilityRole="radio"
      accessibilityLabel={option.label} accessibilityState={{ checked: value.mode === option.mode, disabled }}
      disabled={disabled} onPress={() => onChange({ ...value, mode: option.mode })} style={styles.row}>
      <Ionicons name={value.mode === option.mode ? 'radio-button-on' : 'radio-button-off'} size={23}
        color={value.mode === option.mode ? colors.primary : colors.muted} />
      <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
    </Pressable>)}
    {value.mode === 'otro' && <TextInput accessibilityLabel="Nombre para la firma" value={value.name}
      onChangeText={name => onChange({ ...value, name })} maxLength={150} editable={!disabled}
      placeholder="Nombre para la firma" placeholderTextColor={colors.muted} autoCapitalize="words" disableFullscreenUI
      style={[styles.input, { color: colors.text, borderColor: error ? colors.error : colors.border, backgroundColor: colors.background }]} />}
    {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 4, paddingVertical: 8 },
  title: { fontFamily: 'Poppins-SemiBold', fontSize: 15, marginBottom: 4 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  label: { flex: 1, fontFamily: 'Poppins', fontSize: 14 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: 'Poppins', fontSize: 15 },
  error: { fontFamily: 'Poppins', fontSize: 12, marginTop: 4 },
});
