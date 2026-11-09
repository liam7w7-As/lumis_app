import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
export function NovaledPage({ title, children, back = true }: { title: string; children: ReactNode; back?: boolean }) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={[ui.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
      {back && <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.canGoBack() ? router.back() : router.replace('/dashboard')} style={ui.back}><Text style={{ color: colors.primary, fontSize: 24 }}>‹</Text></Pressable>}
      <Text style={[ui.title, { color: colors.text }]}>{title}</Text>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[ui.body, { paddingBottom: insets.bottom + 24 }]}>{children}</ScrollView>
  </KeyboardAvoidingView>;
}
export function Copy({ children, muted = false, large = false }: { children: ReactNode; muted?: boolean; large?: boolean }) {
  const { colors } = useTheme();
  return <Text selectable style={{ fontFamily: large ? 'Poppins-SemiBold' : 'Poppins', fontSize: large ? 20 : 15, lineHeight: large ? 29 : 23, color: muted ? colors.muted : colors.text }}>{children}</Text>;
}
export function Panel({ children }: { children: ReactNode }) {
  const { colors } = useTheme(); return <View style={[ui.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return <View style={{ gap: 5 }}><Copy>{label}</Copy><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted}
    {...props} style={[ui.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface, opacity: props.editable === false ? 0.65 : 1 }, props.style]} /></View>;
}
export function Choice({ label, active = false, onPress, disabled = false }: { label: string; active?: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress}
    style={[ui.choice, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface, opacity: disabled ? 0.5 : 1 }]}>
    <Text style={{ fontFamily: 'Poppins-Medium', fontSize: 14, color: active ? colors.onPrimary : colors.text }}>{label}</Text>
  </Pressable>;
}
export function Problem({ message, retry }: { message: string | null; retry?: () => void }) {
  const { colors } = useTheme();
  if (!message) return null;
  return <View accessibilityRole="alert" style={{ gap: 8 }}><Text style={{ color: colors.error, fontFamily: 'Poppins', fontSize: 15 }}>{message}</Text>{retry && <Choice label="Volver a intentar" onPress={retry} />}</View>;
}
export function Spinner() { const { colors } = useTheme(); return <ActivityIndicator size="large" color={colors.primary} style={{ padding: 24 }} />; }
export const ui = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontFamily: 'Poppins-SemiBold', fontSize: 21, flex: 1 }, back: { minWidth: 40, minHeight: 44, justifyContent: 'center' },
  body: { padding: 20, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' },
  panel: { padding: 16, gap: 10, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 50, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16, fontFamily: 'Poppins' },
  choice: { borderWidth: 1, borderRadius: 14, minHeight: 46, paddingHorizontal: 15, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
