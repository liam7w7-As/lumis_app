import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { usePressMotion } from '../hooks/usePressMotion';
import { useTheme } from '../theme/ThemeContext';

interface ActionCardProps {
  title: string;
  onPress: () => void;
  children: ReactNode;
}

export function ActionCard({ title, onPress, children }: ActionCardProps) {
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressMotion();

  return (
    <Pressable
      style={styles.press}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View style={[styles.card, { backgroundColor: colors.primary, transform: [{ scale }] }]}>
        {children}
        <Text style={[styles.title, { color: colors.onPrimary }]}>{title}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { flex: 1 },
  card: {
    flex: 1,
    minHeight: 128,
    borderRadius: 20,
    padding: 18,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
});
