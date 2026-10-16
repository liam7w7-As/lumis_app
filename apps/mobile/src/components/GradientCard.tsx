import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePressMotion } from '../hooks/usePressMotion';

interface GradientCardProps {
  title: string;
  gradient: [string, string];
  onPress: () => void;
  children: ReactNode;
  textColor?: string;
}

export function GradientCard({ title, gradient, onPress, children, textColor }: GradientCardProps) {
  const { scale, onPressIn, onPressOut } = usePressMotion();

  return (
    <Pressable
      style={styles.press}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View style={[styles.animated, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {children}
          <Text style={[styles.title, textColor ? { color: textColor } : null]}>{title}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: {
    flex: 1,
  },
  animated: {
    flex: 1,
  },
  card: {
    flex: 1,
    minHeight: 128,
    borderRadius: 20,
    padding: 18,
    justifyContent: 'space-between',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
});
