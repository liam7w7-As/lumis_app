import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useLicense } from '../context/LicenseContext';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../lib/api';
import { IS_NOVALED } from '../lib/backend';
import { PDF_FOOTER_OPTIONS, type PdfFooterKey } from '../lib/documentFooter';
import { feedback } from '../lib/feedback';

export function BusinessFooterPreferences() {
  const { token, user } = useAuth();
  const { business, applyBusiness } = useBusiness();
  const { license } = useLicense();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<PdfFooterKey | null>(null);
  const lock = useRef(false);
  const canChange = !!token && !!business && user?.role === 'admin'
    && (IS_NOVALED || !!license && !license.readOnly);

  const change = async (key: PdfFooterKey, value: boolean) => {
    if (!token || !canChange || lock.current) return;
    lock.current = true;
    setBusy(key);
    try {
      const result = await api.updateBusiness({ [key]: value }, token);
      // Publishing the company is immediate; a slow logo download must not lock the switches.
      void applyBusiness(result.business).catch(() => {});
    } catch (error) {
      feedback.error('No se pudo guardar la preferencia', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally { lock.current = false; setBusy(null); }
  };

  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.title, { color: colors.text }]}>Pie del PDF</Text>
    <Text style={[styles.hint, { color: colors.muted }]}>Elige qué mostrar en los documentos de tu empresa.</Text>
    {PDF_FOOTER_OPTIONS.map(option => <View key={option.key} style={styles.row}>
      <Ionicons name={option.icon} size={20} color={colors.muted} />
      <Text style={[styles.label, { color: colors.text }]}>{option.label}</Text>
      {busy === option.key && <ActivityIndicator size="small" color={colors.primary} />}
      <Switch accessibilityLabel={`Mostrar ${option.label} en el PDF`}
        value={business?.[option.key] ?? true} disabled={!canChange || busy !== null}
        onValueChange={value => { void change(option.key, value); }}
        trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.surface}
        ios_backgroundColor={colors.border} />
    </View>)}
    {user?.role !== 'admin' && <Text style={[styles.hint, { color: colors.muted }]}>El administrador de tu empresa puede cambiar estas preferencias.</Text>}
    {!IS_NOVALED && license?.readOnly && <Text style={[styles.hint, { color: colors.muted }]}>Tu empresa está en modo consulta.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 8, marginBottom: 20 },
  title: { fontFamily: 'Poppins-SemiBold', fontSize: 16 },
  hint: { fontFamily: 'Poppins', fontSize: 12, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  label: { flex: 1, fontFamily: 'Poppins', fontSize: 14 },
});
