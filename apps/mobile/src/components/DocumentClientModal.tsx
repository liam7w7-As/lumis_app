import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { DocumentClientDetails } from '../lib/api';
import { useTheme } from '../theme/ThemeContext';
import { FormModal } from './FormModal';
import { PrimaryButton } from './PrimaryButton';

const fields = [
  { key: 'name', label: 'Nombre / Razón social', max: 150 },
  { key: 'nit', label: 'NIT / CI', max: 40 },
  { key: 'phone', label: 'Teléfono', max: 40 },
  { key: 'email', label: 'Correo electrónico', max: 190 },
  { key: 'address', label: 'Dirección', max: 255 },
] as const;

// Mounted only while open: cancel discards the draft, reopening uses saved data.
export function DocumentClientModal({ initial, onSave, onClose }: {
  initial: DocumentClientDetails;
  onSave: (details: DocumentClientDetails) => Promise<void>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [values, setValues] = useState(initial);
  const draft = useRef(initial);
  const inputs = useRef<Partial<Record<keyof DocumentClientDetails, TextInput | null>>>({});
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { if (!lock.current) onClose(); };
  const save = async () => {
    if (lock.current) return;
    const data: DocumentClientDetails = {
      name: draft.current.name.trim(),
      phone: draft.current.phone?.trim() || null,
      email: draft.current.email?.trim() || null,
      address: draft.current.address?.trim() || null,
      nit: draft.current.nit?.trim() || null,
    };
    if (!data.name) { setError('Escribe el nombre del cliente.'); return; }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setError('Revisa el correo electrónico.'); return;
    }
    if (fields.some(field => (data[field.key]?.length ?? 0) > field.max)) {
      setError('Uno de los datos supera el largo permitido.'); return;
    }
    lock.current = true; setBusy(true); setError(null);
    try { await onSave(data); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron guardar los datos. Inténtalo de nuevo.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <FormModal visible title="Datos del cliente" icon="person-outline" onClose={close}>
    <Text style={[styles.hint, { color: colors.muted }]}>Los cambios se aplican solo a este documento.</Text>
    <View collapsable={false} style={styles.fields}>
      {fields.map(field => <View key={field.key} style={styles.field}>
        <Text onPress={() => inputs.current[field.key]?.focus()} style={[styles.label, { color: colors.muted }]}>{field.label}</Text>
        <TextInput accessibilityLabel={field.label} value={values[field.key] ?? ''}
          ref={input => { inputs.current[field.key] = input; }}
          onChangeText={value => {
            draft.current = { ...draft.current, [field.key]: value };
            setValues(draft.current); setError(null);
          }}
          maxLength={field.max} editable={!busy} disableFullscreenUI
          keyboardType={field.key === 'phone' ? 'phone-pad' : field.key === 'email' ? 'email-address' : 'default'}
          autoCapitalize={field.key === 'email' ? 'none' : 'sentences'}
          autoCorrect={field.key !== 'email'}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />
      </View>)}
    </View>
    {error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>{error}</Text>}
    <PrimaryButton title="Guardar datos" loading={busy} onPress={() => { void save(); }} />
    <Pressable accessibilityRole="button" onPress={close} disabled={busy} style={styles.cancel}>
      <Text style={[styles.label, { color: colors.muted }]}>Cancelar</Text>
    </Pressable>
  </FormModal>;
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, fontFamily: 'Poppins', lineHeight: 19 },
  fields: { gap: 14 }, field: { gap: 5 },
  label: { fontSize: 13, fontFamily: 'Poppins' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 46, fontSize: 14, fontFamily: 'Poppins' },
  error: { fontSize: 12, lineHeight: 18, fontFamily: 'Poppins' },
  cancel: { alignItems: 'center', padding: 10 },
});
