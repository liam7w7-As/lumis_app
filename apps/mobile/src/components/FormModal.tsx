import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { AppModal } from './AppModal';

export function FormModal({ visible, title, onClose, children, icon = 'create-outline' }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: colors.primary + '18' }]}>
              <Ionicons name={icon} size={23} color={colors.primary} />
            </View>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar formulario"
              hitSlop={10} style={[styles.close, { backgroundColor: colors.background }]}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </AppModal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(7,10,23,0.66)' },
  card: { maxHeight: '100%', width: '100%', maxWidth: 460, alignSelf: 'center', borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth, padding: 24, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  icon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, lineHeight: 26, fontFamily: 'Poppins-Bold', fontWeight: '700' },
  content: { gap: 16, paddingBottom: 8 },
});
