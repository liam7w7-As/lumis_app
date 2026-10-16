import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';

export function NoticeCard({ title, message, action, onPress, tone = 'warning' }: {
  title: string; message: string; action?: string; onPress?: () => void; tone?: 'warning' | 'error';
}) {
  const { colors, dark } = useTheme();
  const accent = tone === 'error' ? colors.error : dark ? '#fcd34d' : '#92400e';
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: accent + '45' }]}>
      <View style={[styles.icon, { backgroundColor: accent + '16' }]}>
        <Ionicons name={tone === 'error' ? 'cloud-offline-outline' : 'information-circle-outline'} size={24} color={accent} />
      </View>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.message, { color: dark ? '#c4c8d6' : '#5d6477' }]}>{message}</Text>
        {!!action && <Pressable onPress={onPress} accessibilityRole="button" style={styles.action}>
          <Text style={[styles.actionText, { color: colors.primary }]}>{action}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </Pressable>}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderWidth: 1, borderRadius: 20, padding: 18, gap: 14, marginBottom: 18 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, gap: 6 },
  title: { fontSize: 15, fontFamily: 'Poppins', fontWeight: '600' },
  message: { fontSize: 13, lineHeight: 21, fontFamily: 'Poppins' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, alignSelf: 'flex-start' },
  actionText: { fontSize: 13, fontFamily: 'Poppins', fontWeight: '600' },
});
