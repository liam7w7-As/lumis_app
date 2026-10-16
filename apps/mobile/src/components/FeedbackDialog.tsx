import { useEffect, useState, useSyncExternalStore } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../context/MotionContext';
import { contrastText } from '../lib/brandColors';
import { activeFeedbackHost, feedback, getFeedbackSnapshot, subscribeFeedback } from '../lib/feedback';

const META = {
  success: { icon: 'checkmark-circle-outline', label: 'Todo listo', light: '#15803d', dark: '#86efac' },
  error: { icon: 'alert-circle-outline', label: 'Algo salió mal', light: '#b91c1c', dark: '#fca5a5' },
  warning: { icon: 'warning-outline', label: 'Antes de continuar', light: '#a16207', dark: '#fcd34d' },
  info: { icon: 'information-circle-outline', label: 'Un detalle', light: '', dark: '' },
} as const;

export function FeedbackLayer({ hostId }: { hostId: string }) {
  const snapshot = useSyncExternalStore(subscribeFeedback, getFeedbackSnapshot);
  const message = activeFeedbackHost(snapshot) === hostId ? snapshot.messages[0] : null;
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => { if (message) Keyboard.dismiss(); }, [message]);
  if (!message) return null;
  const meta = META[message.kind];
  const accent = (dark ? meta.dark : meta.light) || colors.primary;
  const confirmation = message.actions.some((action) => action.style === 'destructive');
  const primaryIndex = message.actions.findLastIndex((action) => action.style !== 'cancel');
  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={feedback.dismiss} accessible={false} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.top}>
          <View style={[styles.symbol, { backgroundColor: accent + '18' }]}>
            <Ionicons name={confirmation ? 'trash-outline' : meta.icon} size={32} color={accent} />
          </View>
          {message.options.cancelable !== false && (
            <Pressable onPress={feedback.dismiss} accessibilityRole="button" accessibilityLabel="Cerrar mensaje"
              hitSlop={10} style={[styles.close, { backgroundColor: colors.background }]}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Text style={[styles.eyebrow, { color: accent }]}>{confirmation ? 'Confirmar acción' : meta.label}</Text>
        <Text accessibilityRole="header" accessibilityLiveRegion="assertive"
          style={[styles.title, { color: colors.text }]}>{message.title}</Text>
        {!!message.message && (
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 4 }}>
            <Text selectable style={[styles.message, { color: dark ? '#c4c8d6' : '#5d6477' }]}>{message.message}</Text>
          </ScrollView>
        )}
        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          {message.actions.map((action, index) => {
            const primary = index === primaryIndex;
            const fill = action.style === 'destructive' ? (dark ? '#fca5a5' : '#b91c1c') : colors.primary;
            return (
              <Pressable key={index} accessibilityRole="button"
                onPress={() => { void feedback.press(message.id, index, Platform.OS === "ios" ? 350 : 0); }}
                style={({ pressed }) => [styles.button, {
                  backgroundColor: primary ? fill : colors.background,
                  borderColor: primary ? fill : colors.border,
                  opacity: pressed ? 0.78 : 1,
                }]}>
                <Text style={[styles.buttonText, { color: primary ? contrastText(fill) : colors.text }]}>
                  {action.text || 'Entendido'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
export function FeedbackDialogHost() {
  const reducedMotion = useReducedMotion();
  const snapshot = useSyncExternalStore(subscribeFeedback, getFeedbackSnapshot);
  const message = snapshot.messages[0];
  const [readyId, setReadyId] = useState<number | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setReadyId(message.id), 60);
    return () => clearTimeout(timer);
  }, [message]);
  const visible = !!message && readyId === message.id && activeFeedbackHost(snapshot) === 'root';
  return (
    <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent
      onRequestClose={feedback.dismiss}>
      <FeedbackLayer hostId="root" />
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: 'rgba(7, 10, 23, 0.66)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  card: { width: '100%', maxWidth: 420, maxHeight: '100%', padding: 24, borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth, elevation: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.18, shadowRadius: 28 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  symbol: { width: 64, height: 64, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Poppins', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  title: { fontFamily: 'Poppins-Bold', fontSize: 22, lineHeight: 30, fontWeight: '700', marginBottom: 10 },
  body: { flexGrow: 0, maxHeight: 260 },
  message: { fontFamily: 'Poppins', fontSize: 14, lineHeight: 23 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 22, paddingTop: 18, gap: 10 },
  button: { minHeight: 48, borderRadius: 15, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'Poppins-SemiBold', fontWeight: '600', fontSize: 14, textAlign: 'center' },
});
