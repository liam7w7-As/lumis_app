import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface SegmentedTabsProps<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  fullWidth?: boolean;
}

export function SegmentedTabs<T extends string>({ options, value, onChange, fullWidth = false }: SegmentedTabsProps<T>) {
  const { colors } = useTheme();

  return (
    <View style={[styles.group, fullWidth && styles.fullGroup, { backgroundColor: fullWidth ? colors.surface : colors.background }]}>
      {options.map((opt) => {
        const selected = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.tab, fullWidth && styles.fullTab, selected && { backgroundColor: colors.primary }]}
            onPress={() => onChange(opt.key)}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.onPrimary : colors.muted },
                selected && styles.labelSelected,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 4,
    gap: 2,
  },
  tab: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fullGroup: { width: '100%' },
  fullTab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  label: {
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  labelSelected: {
    fontWeight: '700',
  },
});
