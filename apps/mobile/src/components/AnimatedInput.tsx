import type { ReactNode } from 'react';
import { Animated, StyleSheet, TextInput, useAnimatedValue, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

type IconName = keyof typeof Ionicons.glyphMap;

interface AnimatedInputProps {
  icon: IconName;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  right?: ReactNode;
}

export function AnimatedInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  right,
}: AnimatedInputProps) {
  const { colors } = useTheme();
  const focus = useAnimatedValue(0);

  const animateTo = (to: number) => {
    Animated.timing(focus, { toValue: to, duration: 220, useNativeDriver: false }).start();
  };

  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.primary],
  });
  const barWidth = focus.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.row, { borderBottomColor: borderColor }]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.icon} />
        <Animated.View style={[styles.iconOverlay, { opacity: focus }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </Animated.View>
      </View>
      <TextInput
        style={[styles.input, { color: colors.text }]}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        onFocus={() => animateTo(1)}
        onBlur={() => animateTo(0)}
      />
      {right}
      <Animated.View
        style={[styles.growBar, { backgroundColor: colors.primary, width: barWidth }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 24,
    gap: 10,
  },
  iconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
    paddingVertical: 4,
  },
  growBar: {
    position: 'absolute',
    left: 0,
    bottom: -1,
    height: 2,
    borderRadius: 1,
  },
});
