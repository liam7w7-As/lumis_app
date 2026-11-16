import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLicense } from '../context/LicenseContext';
import { IS_NOVALED } from '../lib/backend';
import { formatLicenseExpiry, licenseDaysRemaining, licenseExpiryMessage, licenseStatusLabel } from '../lib/licensePresentation';
import { useTheme } from '../theme/ThemeContext';

const quotaLabels = { quotes: 'Cotizaciones', sales: 'Ventas', deliveries: 'Entregas', scans: 'Escaneos' };

export function LicenseStatusCard() {
  const { license, error, refresh } = useLicense();
  const { colors, dark } = useTheme();
  if (IS_NOVALED) return null;

  const days = license ? licenseDaysRemaining(license.expiresOn) : null;
  const restricted = !!license && (license.readOnly || license.state !== 'active' || !license.hasSeat);
  const expiresSoon = license?.plan !== 'free' && days !== null && days >= 0 && days <= 7;
  const warning = dark ? '#fcd34d' : '#92400e';
  const accent = !license ? colors.muted
    : restricted ? colors.error
      : expiresSoon ? warning : dark ? '#86efac' : '#166534';
  const quotas = license?.scannerAvailable
    ? (['quotes', 'sales', 'deliveries', 'scans'] as const)
    : (['quotes', 'sales', 'deliveries'] as const);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <View style={[styles.icon, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="shield-checkmark-outline" size={23} color={colors.text} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={[styles.eyebrow, { color: colors.muted }]}>MI PLAN LUMIS</Text>
            <Text style={[styles.title, { color: colors.text }]}>
              {license ? license.planName : 'Mi plan'}
            </Text>
          </View>
        </View>
        <View style={[styles.status, { backgroundColor: accent + '16' }]}>
          {!license && !error && <ActivityIndicator size="small" color={colors.muted} />}
          <Text style={[styles.statusText, { color: accent }]}>
            {license ? licenseStatusLabel(license) : error ? 'Sin comprobar' : 'Comprobando'}
          </Text>
        </View>
      </View>

      {license && (
        <>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={[styles.eyebrow, { color: colors.muted }]}>VENCIMIENTO</Text>
              <Text style={[styles.value, { color: colors.text }]}>
                {license.plan === 'free' ? 'Sin vencimiento' : license.expiresOn ? formatLicenseExpiry(license.expiresOn) : 'Por confirmar'}
              </Text>
              <Text style={[styles.caption, { color: expiresSoon ? warning : colors.muted }]}>
                {licenseExpiryMessage(license)}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={[styles.eyebrow, { color: colors.muted }]}>USUARIOS HABILITADOS</Text>
              <Text style={[styles.value, { color: colors.text }]}>
                {license.users.enabled}{license.users.limit !== null ? ` / ${license.users.limit}` : ''}
              </Text>
              <Text style={[styles.caption, { color: colors.muted }]}>
                {license.users.limit === null ? 'Sin límite de usuarios' : 'Cupos de tu empresa'}
              </Text>
            </View>
          </View>
          {license.plan === 'free' && (
            <View style={styles.quotas}>
              {quotas.map((key) => (
                <View key={key} style={[styles.quota, { backgroundColor: colors.background }]}>
                  <Text style={[styles.quotaAmount, { color: colors.text }]}>
                    {license.quotas[key].used} / {license.quotas[key].limit ?? '∞'}
                  </Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>{quotaLabels[key]}</Text>
                </View>
              ))}
            </View>
          )}
          {restricted && (
            <Text style={[styles.caption, { color: colors.error }]}>
              {!license.hasSeat && license.state === 'active'
                ? 'Tu usuario no tiene un cupo disponible. Puedes consultar y exportar.'
                : 'Puedes consultar y exportar tus documentos. Revisa tu plan para volver a crear y editar.'}
            </Text>
          )}
        </>
      )}

      {!!error && (
        <View style={[styles.error, { borderColor: colors.error + '45' }]}>
          <Ionicons name="cloud-offline-outline" size={20} color={colors.error} />
          <View style={styles.errorContent}>
            <Text style={[styles.errorTitle, { color: colors.error }]}>No se pudo actualizar el plan</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>
              {error}{license ? '\nMostramos la última información disponible.' : ''}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}>
              <Text style={[styles.actionText, { color: colors.text }]}>Reintentar</Text>
              <Ionicons name="refresh" size={15} color={colors.text} />
            </Pressable>
          </View>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ver mi plan y cupos"
        onPress={() => router.push('/license')}
        style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[styles.actionText, { color: colors.onPrimary }]}>Mi plan</Text>
        <Ionicons name="arrow-forward" size={17} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 17, gap: 16, borderWidth: 1, borderRadius: 20, marginVertical: 18 },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 11, flexGrow: 1 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { gap: 2, flexShrink: 1 },
  eyebrow: { fontFamily: 'Poppins', fontSize: 9, letterSpacing: 0.8 },
  title: { fontFamily: 'Poppins-SemiBold', fontSize: 19 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexShrink: 1 },
  statusText: { fontFamily: 'Poppins-SemiBold', fontSize: 10, flexShrink: 1 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  metric: { flex: 1, minWidth: 135, gap: 4 },
  value: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
  caption: { fontFamily: 'Poppins', fontSize: 11, lineHeight: 18 },
  quotas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quota: { flexGrow: 1, flexBasis: 80, padding: 10, gap: 2, borderRadius: 12 },
  quotaAmount: { fontFamily: 'Poppins-SemiBold', fontSize: 13 },
  error: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  errorContent: { flex: 1, gap: 4 },
  errorTitle: { fontFamily: 'Poppins-SemiBold', fontSize: 11 },
  retry: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingVertical: 7 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  actionText: { fontFamily: 'Poppins-SemiBold', fontSize: 12 },
});
