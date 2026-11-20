import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { feedback } from '../lib/feedback';
import type { FormDraftSnapshot } from '../lib/formDrafts';

export function FormDraftNotice({ ready, status, hasDraft, restored, onRetry, onDiscard }: Omit<FormDraftSnapshot<object>, 'value'> & {
  onRetry: () => void; onDiscard: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const busy = status === 'loading' || status === 'saving' || status === 'clearing';
  const message = status === 'error'
    ? ready ? 'No se pudo guardar el borrador en este teléfono.' : 'No se pudo recuperar el borrador. Reintenta para continuar.'
    : status === 'loading' ? 'Recuperando borrador…'
    : status === 'clearing' ? 'Descartando borrador…'
    : status === 'saving' ? 'Guardando borrador…'
    : !hasDraft ? 'Puedes salir y continuar después.'
    : restored ? 'Borrador recuperado · Solo en este teléfono' : 'Borrador guardado en este teléfono';
  const discard = () => feedback.warning('¿Descartar este borrador?', 'Se borrarán los datos de este formulario que todavía no guardaste.', [
    { text: 'Conservar', style: 'cancel' },
    { text: 'Descartar', style: 'destructive', onPress: onDiscard },
  ]);
  return <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.row}>
      {busy ? <ActivityIndicator size="small" color={colors.primary} />
        : <Ionicons name={status === 'error' ? 'alert-circle-outline' : 'document-text-outline'} size={18} color={status === 'error' ? colors.error : colors.primary} />}
      <Text accessibilityLiveRegion="polite" style={[styles.message, { color: status === 'error' ? colors.error : colors.muted }]}>{message}</Text>
    </View>
    <View style={styles.actions}>
      {status === 'error' && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.action}>
        <Text style={[styles.actionText, { color: colors.primary }]}>Reintentar</Text>
      </Pressable>}
      {(ready && hasDraft || !ready && status === 'error') && <Pressable accessibilityRole="button" accessibilityLabel="Descartar borrador" onPress={discard} disabled={status === 'clearing'} style={styles.action}>
        <Text style={[styles.actionText, { color: colors.muted }]}>Descartar</Text>
      </Pressable>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  message: { flex: 1, fontFamily: 'Poppins', fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  action: { minHeight: 44, justifyContent: 'center' },
  actionText: { fontFamily: 'Poppins', fontSize: 12, fontWeight: '600' },
});
