import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLicense } from '../context/LicenseContext';
import { IS_NOVALED } from '../lib/backend';
import { useTheme } from '../theme/ThemeContext';
export function LicenseStatusCard({ onlyReadOnly = false }: { onlyReadOnly?: boolean }) {
  const { license, error } = useLicense();
  const { colors } = useTheme();
  if (IS_NOVALED || (onlyReadOnly && !license?.readOnly)) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ver mi plan y cupos"
      onPress={() => router.push('/license')}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primary + '18' }]}>
        <Ionicons name="shield-checkmark-outline" size={24} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.title, { color: colors.text }]}>
          {license ? 'Plan ' + license.planName : 'Mi plan Lumis'}
          {license?.readOnly ? ' · Solo consulta' : ''}
        </Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {license?.readOnly
            ? 'Puedes consultar y exportar. Revisa tu licencia para continuar.'
            : error
              ? 'No se pudo comprobar tu plan. Toca para reintentar.'
              : 'Consulta tu licencia, usuarios y cupos disponibles.'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    marginVertical: 18,
  },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Poppins-SemiBold', fontSize: 14 },
  caption: { fontFamily: 'Poppins', fontSize: 11, lineHeight: 18 },
});
