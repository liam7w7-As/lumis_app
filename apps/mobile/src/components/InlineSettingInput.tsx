import type { Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import type { InlineSaveState } from '../lib/inlineAutosave';
import { useTheme } from '../theme/ThemeContext';

export function InlineSettingInput({ label, state, focused, inputRef, onRetry, ...input }: TextInputProps & {
  label: string;
  state?: InlineSaveState;
  focused?: boolean;
  inputRef?: Ref<TextInput>;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const error = state?.status === 'error';
  const saving = state?.status === 'saving';
  return (
    <View style={styles.field}>
      <View style={styles.heading}>
        <Text style={[styles.label, { color: focused ? colors.primary : colors.muted }]}>{label}</Text>
        <View style={styles.status} accessibilityLiveRegion="polite">
          {saving && <ActivityIndicator size="small" color={colors.primary} />}
          <Text style={[styles.statusText, { color: error ? colors.error : colors.muted }]}>
            {saving ? 'Guardando…' : state?.status === 'saved' ? 'Guardado' :
              state?.status === 'dirty' ? 'Sin guardar' : error ? 'No guardado' : ''}
          </Text>
        </View>
      </View>
      <TextInput {...input} ref={inputRef} accessibilityLabel={label}
        placeholderTextColor={colors.muted} selectionColor={colors.primary}
        underlineColorAndroid="transparent" disableFullscreenUI
        style={[styles.input, { color: colors.text, borderColor: error ? colors.error : focused ? colors.primary : colors.border }, input.style]} />
      {error && <View style={styles.error}>
        <Text style={[styles.message, { color: colors.error }]}>{state.message}</Text>
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={'Reintentar guardar ' + label}
          hitSlop={8} style={styles.retry}>
          <Text style={[styles.retryText, { color: colors.primary }]}>Reintentar</Text>
        </Pressable>
      </View>}
    </View>
  );
}
const styles = StyleSheet.create({
  field: { flex: 1, paddingVertical: 10, gap: 2 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 22 },
  label: { flex: 1, fontSize: 12, fontFamily: 'Poppins' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { fontSize: 10, fontFamily: 'Poppins' },
  input: { fontSize: 15, fontFamily: 'Poppins', minHeight: 46, paddingVertical: 9, paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth },
  error: { gap: 4, paddingTop: 4 },
  message: { fontSize: 12, fontFamily: 'Poppins' },
  retry: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  retryText: { fontSize: 12, fontFamily: 'Poppins-SemiBold' },
});
