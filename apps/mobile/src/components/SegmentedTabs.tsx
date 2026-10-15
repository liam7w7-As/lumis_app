import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface SegmentedTabsProps<T extends string> {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}

export function SegmentedTabs<T extends string>({ options, value, onChange }: SegmentedTabsProps<T>) {
  const { colors } = useTheme();

  return (
    <View style={[styles.group, { backgroundColor: colors.background }]}>
      {options.map((opt) => {
        const selected = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            style={[styles.tab, selected && { backgroundColor: colors.primary }]}
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
  label: {
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  labelSelected: {
    fontWeight: '700',
  },
});
