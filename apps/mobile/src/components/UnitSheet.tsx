import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { isValidUnitName } from '../lib/units';

interface UnitSheetProps {
  visible: boolean;
  units: string[];
  selected: string;
  canDelete: boolean;
  onSelect: (unit: string) => void;
  onAdd: (name: string) => void;
  onRename: (unit: string, name: string) => void;
  onDelete: (unit: string) => void;
  onClose: () => void;
}

const NEW_UNIT = '__new__';

export function UnitSheet({
  visible,
  units,
  selected,
  canDelete,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onClose,
}: UnitSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetEdit = () => {
    setEditing(null);
    setDraft('');
    setError(null);
  };

  const close = () => {
    resetEdit();
    onClose();
  };

  const startAdd = () => {
    setEditing(NEW_UNIT);
    setDraft('');
    setError(null);
  };

  const startRename = (unit: string) => {
    setEditing(unit);
    setDraft(unit);
    setError(null);
  };

  const submit = () => {
    if (editing == null) return;
    const name = draft.trim();
    const message = isValidUnitName(name, units, editing === NEW_UNIT ? undefined : editing);
    if (message) {
      setError(message);
      return;
    }
    if (editing === NEW_UNIT) {
      onAdd(name);
    } else if (name !== editing) {
      onRename(editing, name);
    }
    resetEdit();
  };

  const confirmDelete = (unit: string) => {
    if (!canDelete) {
      Alert.alert('No se puede borrar', 'Debe quedar al menos una unidad de medida.');
      return;
    }
    Alert.alert('Borrar unidad', `¿Borrar "${unit}" de la lista?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => onDelete(unit) },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={close} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.anchor}
        >
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.text }]}>Unidad de Medida</Text>
              <Pressable style={styles.addButton} onPress={startAdd} hitSlop={8}>
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text style={[styles.addText, { color: colors.primary }]}>Agregar</Text>
              </Pressable>
            </View>

            {editing != null && (
              <View style={styles.editBlock}>
                <View style={styles.editRow}>
                  <TextInput
                    style={[
                      styles.editInput,
                      { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                    ]}
                    value={draft}
                    onChangeText={(v) => {
                      setDraft(v);
                      setError(null);
                    }}
                    placeholder="Nombre de la unidad"
                    placeholderTextColor={colors.muted}
                    autoFocus
                    autoCapitalize="words"
                    maxLength={20}
                    onSubmitEditing={submit}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={[styles.editAction, { backgroundColor: colors.primary }]}
                    onPress={submit}
                    hitSlop={6}
                  >
                    <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
                  </Pressable>
                  <Pressable
                    style={[styles.editAction, { backgroundColor: colors.surface }]}
                    onPress={resetEdit}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={18} color={colors.muted} />
                  </Pressable>
                </View>
                {error && <Text style={[styles.editError, { color: colors.error }]}>{error}</Text>}
              </View>
            )}

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {units.map((unit, index) => {
                const isSelected = unit === selected;
                const isLast = index === units.length - 1;
                return (
                  <View
                    key={unit}
                    style={[
                      styles.row,
                      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    ]}
                  >
                    <Pressable
                      style={styles.rowMain}
                      onPress={() => {
                        onSelect(unit);
                        close();
                      }}
                    >
                      {isSelected ? (
                        <View style={[styles.radioOn, { backgroundColor: colors.primary }]}>
                          <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                        </View>
                      ) : (
                        <View style={[styles.radioOff, { borderColor: colors.muted }]} />
                      )}
                      <Text
                        style={[
                          styles.rowLabel,
                          { color: isSelected ? colors.primary : colors.text },
                          isSelected && styles.rowLabelSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {unit}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => startRename(unit)} hitSlop={10}>
                      <Ionicons name="pencil-outline" size={18} color={colors.icon} />
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(unit)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 15, 25, 0.45)',
  },
  anchor: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: '72%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  addText: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  editBlock: {
    marginTop: 8,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    fontFamily: 'Poppins',
  },
  editAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editError: {
    fontSize: 12,
    fontFamily: 'Poppins',
    marginTop: 6,
  },
  list: {
    flexGrow: 0,
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingRight: 2,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
  },
  radioOn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOff: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Poppins',
  },
  rowLabelSelected: {
    fontWeight: '700',
  },
});
