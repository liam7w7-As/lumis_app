import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';

export const SWIPE_ACTIONS_WIDTH = 260;
export interface SwipeAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export function SwipeActions({ actions }: { actions: SwipeAction[] }) {
  const { colors } = useTheme();
  return <View style={[styles.panel, { backgroundColor: colors.primary }]}>
    {actions.map((action) => <Pressable key={action.label} accessibilityRole="button"
      accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) =>
        [styles.action, pressed && styles.pressedAction]}>
      <Ionicons name={action.icon} size={22} color={colors.onPrimary} />
      <Text style={[styles.label, { color: colors.onPrimary }]} numberOfLines={2}>{action.label}</Text>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({
  panel: { flex: 1, flexDirection: 'row', borderRadius: 16, paddingHorizontal: 6, overflow: 'hidden' },
  action: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12 },
  pressedAction: { transform: [{ scale: 0.95 }] },
  label: { fontSize: 10, lineHeight: 14, fontFamily: 'Poppins-SemiBold', textAlign: 'center' },
});

