import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SwipeRow, type SwipeRowHandle } from './SwipeRow';
import { useTheme } from '../theme/ThemeContext';

export function ItemSwipe({ children, disabled, onEdit, onDelete, onDuplicate, onMove }: {
  children: ReactNode; disabled?: boolean;
  onEdit: () => void; onDelete: () => void; onDuplicate: () => void; onMove: () => void;
}) {
  const { colors } = useTheme();
  const ref = useRef<SwipeRowHandle>(null);
  if (disabled) return <View>{children}</View>;
  const actions = [
    { label: 'Editar', icon: 'pencil-outline', run: onEdit },
    { label: 'Eliminar', icon: 'trash-outline', run: onDelete },
    { label: 'Duplicar', icon: 'copy-outline', run: onDuplicate },
    { label: 'Mover', icon: 'move-outline', run: onMove },
  ] as const;
  return <View style={styles.clip}>
    <SwipeRow ref={ref} actionsWidth={248} renderRightActions={() =>
      <View style={[styles.actions, { backgroundColor: colors.primary }]}>
        {actions.map((action) => <Pressable key={action.label} accessibilityRole="button"
          accessibilityLabel={action.label + ' producto'} style={styles.action}
          onPress={() => { ref.current?.close(); action.run(); }}>
          <Ionicons name={action.icon} size={21} color={colors.onPrimary} />
          <Text style={[styles.label, { color: colors.onPrimary }]}>{action.label}</Text>
        </Pressable>)}
      </View>}>
      {children}
    </SwipeRow>
  </View>;
}
const styles = StyleSheet.create({
  clip: { borderRadius: 14, overflow: 'hidden' },
  actions: { flex: 1, flexDirection: 'row', borderRadius: 14 },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { fontSize: 10, fontWeight: '600' },
});
