import { feedback } from '../lib/feedback';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api, type User } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { FormModal } from './FormModal';
import { PrimaryButton } from './PrimaryButton';

export function TeamUsers({ onCreated }: { onCreated: () => void }) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);
  const load = useCallback(async () => {
    if (!token || user?.role !== 'admin') return;
    try { setUsers((await api.users(token)).users); }
    catch (err) { feedback.alert('Usuarios', err instanceof Error ? err.message : 'No se pudo cargar el equipo'); }
  }, [token, user?.role]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const save = async () => {
    if (!token || user?.role !== 'admin' || submitLock.current) return;
    if (name.trim().length < 2 || name.trim().length > 120 || !/^[a-zA-Z0-9._-]{3,60}$/.test(username.trim()) || password.length < 8 || password.length > 72) {
      feedback.alert('Revisa los datos', 'Escribe un nombre de 2 a 120 caracteres, un usuario de 3 a 60 caracteres (letras, números, punto, guion o guion bajo) y una contraseña de 8 a 72 caracteres.');
      return;
    }
    submitLock.current = true;
    setBusy(true);
    try {
      const { user: created } = await api.createUser({ name: name.trim(), username: username.trim(), password }, token);
      setUsers((prev) => [...prev, created]);
      setOpen(false); setName(''); setUsername(''); setPassword('');
      onCreated();
      feedback.alert('Vendedor registrado', 'Ya puede iniciar sesión con su usuario y contraseña en esta empresa.');
    } catch (err) { feedback.alert('Error', err instanceof Error ? err.message : 'No se pudo registrar'); }
    finally { submitLock.current = false; setBusy(false); }
  };
  if (user?.role !== 'admin') return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Usuarios de la empresa</Text>
      {users.map((member) => <View key={member.id} style={styles.row}>
        <Text style={{ color: colors.text, flex: 1 }}>{member.name} · @{member.username}</Text>
        <Text style={{ color: colors.muted }}>{member.role === 'admin' ? 'Administrador' : 'Vendedor'}</Text>
      </View>)}
      <Pressable onPress={() => setOpen(true)} style={[styles.add, { borderColor: colors.primary }]}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>Agregar vendedor</Text>
      </Pressable>
      <FormModal visible={open} title="Registrar vendedor" icon="person-add-outline" onClose={() => { if (!busy) { setOpen(false); setPassword(''); } }}>
        <Text style={{ color: colors.muted }}>Tendrá acceso a las ventas, cotizaciones y catálogo de esta empresa.</Text>
        <TextInput accessibilityLabel="Nombre del vendedor" placeholder="Nombre completo" value={name} onChangeText={setName}
          autoFocus autoCapitalize="words" maxLength={120} editable={!busy} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <TextInput accessibilityLabel="Usuario del vendedor" placeholder="Usuario" value={username} onChangeText={setUsername}
          autoCapitalize="none" autoCorrect={false} maxLength={60} editable={!busy} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <TextInput accessibilityLabel="Contraseña del vendedor" placeholder="Contraseña (mínimo 8 caracteres)" value={password}
          onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={72} editable={!busy}
          placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <PrimaryButton title="Guardar vendedor" onPress={save} loading={busy} />
      </FormModal>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 16 },
  title: { fontSize: 18, fontFamily: 'Poppins', fontWeight: '700' },
  row: { gap: 4 }, add: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 50 },
});
