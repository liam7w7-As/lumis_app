import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import type { Branch } from '../lib/api';

interface BranchFilterSheetProps {
  visible: boolean;
  branches: Branch[];
  selectedId: number | null;
  onSelect: (branchId: number | null) => void;
  onClose: () => void;
}

export function BranchFilterSheet({
  visible,
  branches,
  selectedId,
  onSelect,
  onClose,
}: BranchFilterSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const renderOption = (key: number | null, label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const selected = selectedId === key;
    return (
      <Pressable
        key={key ?? 'all'}
        onPress={() => onSelect(key)}
        style={({ pressed }) => [
          styles.option,
          selected
            ? { backgroundColor: `${colors.primary}14`, borderColor: colors.primary }
            : { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={selected ? colors.primary : colors.icon}
        />
        <Text
          style={[
            styles.optionLabel,
            { color: selected ? colors.primary : colors.text },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {selected && (
          <View style={[styles.check, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.titleRow}>
          <View style={[styles.titleIcon, { backgroundColor: `${colors.primary}1A` }]}>
            <Ionicons name="storefront-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.titleText}>
            <Text style={[styles.title, { color: colors.text }]}>Filtrar por Sucursal</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Selecciona para filtrar el historial
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {renderOption(null, 'Todas las sucursales', 'infinite-outline')}
          {branches.map((b) => renderOption(b.id, b.name, 'business-outline'))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 15, 25, 0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Poppins',
    marginTop: 2,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 10,
    paddingBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: '600',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
