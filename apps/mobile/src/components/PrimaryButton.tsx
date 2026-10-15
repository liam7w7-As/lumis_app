import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function PrimaryButton({ title, onPress, disabled, loading }: PrimaryButtonProps) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const press = (to: number) => {
    Animated.timing(scale, { toValue: to, duration: 120, useNativeDriver: true }).start();
  };

  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      onPressIn={() => press(0.97)}
      onPressOut={() => press(1)}
    >
      <Animated.View
        style={[
          styles.button,
          { backgroundColor: colors.primary, transform: [{ scale }], opacity: inactive ? 0.7 : 1 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={[styles.text, { color: colors.onPrimary }]}>{title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  text: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
});
