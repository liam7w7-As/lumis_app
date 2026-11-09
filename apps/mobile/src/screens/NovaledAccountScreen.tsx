import { useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useTheme } from '../theme/ThemeContext';
import { Choice, Copy, NovaledPage, Panel, Problem, ui } from '../components/NovaledUI';
import { View } from 'react-native';
export function NovaledAccountScreen() {
  const { user, logout } = useAuth(); const { business, changeMode } = useBusiness(); const { mode } = useTheme();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const signOut = async () => { setBusy(true); setError(null); try { await logout(); router.replace('/login'); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cerrar la sesión.'); } finally { setBusy(false); } };
  return <NovaledPage title="Mi cuenta"><Panel><Copy large>{user?.name}</Copy><Copy>{business?.nombre ?? 'Novaled'}</Copy>
    <Copy muted>Usuario: {user?.username}</Copy><Copy muted>La empresa y los permisos se administran desde Novaled.</Copy></Panel>
    <Copy large>Apariencia</Copy><View style={ui.row}>{(['system','light','dark'] as const).map(value => <Choice key={value} label={{ system: 'Sistema', light: 'Claro', dark: 'Oscuro' }[value]}
      active={mode === value} onPress={() => { void changeMode(value).catch(err => setError(err instanceof Error ? err.message : 'No se pudo guardar el tema.')); }} />)}</View>
    <Problem message={error} /><Choice label={busy ? 'Cerrando sesión…' : 'Cerrar sesión'} disabled={busy} onPress={() => void signOut()} />
  </NovaledPage>;
}
