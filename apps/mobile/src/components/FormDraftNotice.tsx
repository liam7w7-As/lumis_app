import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { feedback } from '../lib/feedback';
import type { FormDraftSnapshot } from '../lib/formDrafts';

export function FormDraftNotice({ ready, status, hasDraft, onRetry, onDiscard }: Omit<FormDraftSnapshot<object>, 'value'> & {
  onRetry: () => void; onDiscard: () => Promise<void>;
}) {
  const { colors, dark } = useTheme();
  const busy = status === 'loading' || status === 'saving' || status === 'clearing';
  const failed = status === 'error';
  const message = ready ? 'No se pudo guardar el borrador en este teléfono.' : 'No se pudo recuperar el borrador. Reintenta para continuar.';
  const statusLabel = status === 'loading' ? 'Recuperando borrador'
    : status === 'clearing' ? 'Descartando borrador'
    : status === 'saving' ? 'Guardando borrador'
    : hasDraft ? 'Borrador guardado en este teléfono' : 'Sin borrador pendiente';
  const indicatorColor = busy ? colors.primary : hasDraft ? (dark ? '#86efac' : '#15803d') : colors.border;
  const discard = () => feedback.warning('¿Descartar este borrador?', 'Se borrarán los datos de este formulario que todavía no guardaste.', [
    { text: 'Conservar', style: 'cancel' },
    { text: 'Descartar', style: 'destructive', onPress: onDiscard },
  ]);
  return <View collapsable={false} style={[styles.box, failed && [styles.errorBox, { backgroundColor: colors.surface, borderColor: colors.border }]]}>
    <View style={styles.row}>
      {failed ? <>
        <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
        <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.error }]}>{message}</Text>
      </> : <View accessible accessibilityLabel={statusLabel} style={styles.indicator}>
        {busy ? <ActivityIndicator size="small" color={colors.primary} />
          : <View style={[styles.dot, { backgroundColor: indicatorColor }]} />}
      </View>}
    </View>
    <View style={styles.actions}>
      {failed && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.action}>
        <Text style={[styles.actionText, { color: colors.primary }]}>Reintentar</Text>
      </Pressable>}
      {(ready && hasDraft || !ready && failed) && <Pressable accessibilityRole="button" accessibilityLabel="Descartar borrador" onPress={discard} disabled={status === 'clearing'} style={[styles.action, styles.discard]}>
        <Ionicons name="trash-outline" size={18} color={colors.muted} />
      </Pressable>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  box: { minHeight: 44, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  errorBox: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 20 },
  row: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  message: { flex: 1, fontFamily: 'Poppins', fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  action: { minHeight: 44, justifyContent: 'center' },
  discard: { minWidth: 44, alignItems: 'center' },
  indicator: { width: 20, height: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actionText: { fontFamily: 'Poppins', fontSize: 12, fontWeight: '600' },
});
