import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/ThemeContext';
import { replaceLocalDate } from '../lib/calendarDate';
import { feedback } from '../lib/feedback';
import { FormModal } from './FormModal';
import { PrimaryButton } from './PrimaryButton';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// Rango compatible con las columnas TIMESTAMP de las instalaciones MySQL actuales.
const MIN_YEAR = 1971;
const MAX_YEAR = 2037;

export function DatePickerModal({ value, onClose, onSave, title = 'Fecha de la venta' }: {
  title?: string;
  value: string;
  onClose: () => void;
  onSave: (iso: string) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState(() => new Date(value));
  const [month, setMonth] = useState(() => new Date(value).getMonth());
  const [year, setYear] = useState(() => new Date(value).getFullYear());
  const [saving, setSaving] = useState(false);
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 },
    (_, i) => i >= offset && i < offset + count ? i - offset + 1 : null);
  const today = new Date();
  const selectedLabel = selected.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

  const moveMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    if (next.getFullYear() < MIN_YEAR || next.getFullYear() > MAX_YEAR) return;
    setMonth(next.getMonth());
    setYear(next.getFullYear());
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(replaceLocalDate(value, selected.getFullYear(), selected.getMonth(), selected.getDate()));
      onClose();
    } catch (err) {
      feedback.error('No se pudo guardar la fecha',
        err instanceof Error ? err.message : 'Inténtalo de nuevo. La fecha anterior se mantiene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal visible title={title} icon="calendar-outline" onClose={() => { if (!saving) onClose(); }}>
      <View style={[styles.selection, { backgroundColor: colors.primary + '12' }]}>
        <Text style={[styles.caption, { color: colors.muted }]}>Fecha seleccionada</Text>
        <Text style={[styles.selectedDate, { color: colors.text }]}>{selectedLabel}</Text>
      </View>
      <View style={styles.monthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior"
          disabled={saving || (year === MIN_YEAR && month === 0)}
          onPress={() => moveMonth(-1)} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.month, { color: colors.text }]}>{MONTHS[month]} {year}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente"
          disabled={saving || (year === MAX_YEAR && month === 11)}
          onPress={() => moveMonth(1)} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((day, i) => <View key={'week-' + i} style={styles.cell}>
          <Text style={[styles.caption, { color: colors.muted }]}>{day}</Text>
        </View>)}
        {cells.map((day, i) => {
          const active = day === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear();
          const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          return <View key={i} style={styles.cell}>
            {day != null && <Pressable accessibilityRole="button"
              accessibilityLabel={day + ' de ' + MONTHS[month] + ' de ' + year}
              accessibilityState={{ selected: active, disabled: saving }}
              disabled={saving} onPress={() => setSelected(new Date(year, month, day, 12))}
              style={[styles.day, active && { backgroundColor: colors.primary },
                isToday && !active && { borderColor: colors.primary, borderWidth: 1 }]}>
              <Text style={[styles.dayLabel, { color: active ? colors.onPrimary : colors.text }]}>{day}</Text>
            </Pressable>}
          </View>;
        })}
      </View>
      <Pressable accessibilityRole="button" disabled={saving}
        onPress={() => { setSelected(today); setYear(today.getFullYear()); setMonth(today.getMonth()); }}
        style={styles.today}>
        <Text style={[styles.todayLabel, { color: colors.primary }]}>Volver a hoy</Text>
      </Pressable>
      <PrimaryButton title="Guardar fecha" onPress={save} loading={saving} />
    </FormModal>
  );
}

const styles = StyleSheet.create({
  selection: { borderRadius: 16, padding: 16, gap: 4 },
  caption: { fontSize: 12, fontFamily: 'Poppins' },
  selectedDate: { fontSize: 17, fontFamily: 'Poppins-SemiBold' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontSize: 16, fontFamily: 'Poppins-SemiBold' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285714%', minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 14, fontFamily: 'Poppins-Medium' },
  today: { alignSelf: 'center', padding: 10 },
  todayLabel: { fontSize: 14, fontFamily: 'Poppins-SemiBold' },
});
