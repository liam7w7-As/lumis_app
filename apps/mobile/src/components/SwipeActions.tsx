import { Pressable, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { gradientFor } from '../lib/brandColors';

export const SWIPE_ACTIONS_WIDTH = 260;
export interface SwipeAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export function SwipeActions({ actions }: { actions: SwipeAction[] }) {
  const { colors } = useTheme();
  return <LinearGradient colors={gradientFor(colors.primary)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.panel}>
    {actions.map((action) => <Pressable key={action.label} accessibilityRole="button"
      accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) =>
        [styles.action, pressed && { backgroundColor: colors.onPrimary + '18' }]}>
      <Ionicons name={action.icon} size={22} color={colors.onPrimary} />
      <Text style={[styles.label, { color: colors.onPrimary }]} numberOfLines={2}>{action.label}</Text>
    </Pressable>)}
  </LinearGradient>;
}
const styles = StyleSheet.create({
  panel: { flex: 1, flexDirection: 'row', borderRadius: 16, paddingHorizontal: 6, overflow: 'hidden' },
  action: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12 },
  label: { fontSize: 10, lineHeight: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center' },
});
