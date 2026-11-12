import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import * as Linking from 'expo-linking';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLicense } from '../context/LicenseContext';
import { useTheme } from '../theme/ThemeContext';
import { NoticeCard } from '../components/NoticeCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { feedback } from '../lib/feedback';
const labels = {
  quotes: 'Cotizaciones',
  sales: 'Notas de venta',
  deliveries: 'Notas de entrega',
  scans: 'Escaneos mágicos',
};
export function LicenseScreen() {
  const { license, error, refresh } = useLicense();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const contact = () => {
    if (license?.supportUrl && /^https:\/\//.test(license.supportUrl))
      void Linking.openURL(license.supportUrl).catch(() =>
        feedback.error(
          'No se pudo abrir soporte',
          'Inténtalo de nuevo o contacta con quien te proporcionó Lumis.',
        ),
      );
    else
      feedback.info(
        'Renovar o cambiar de plan',
        'Contacta con el equipo que te proporcionó Lumis para activar Pro o Plus. Tu empresa y sus documentos se conservarán.',
      );
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.heading, { color: colors.text }]}>Mi plan Lumis</Text>
        <Pressable
          onPress={() => {
            void refresh();
          }}
          accessibilityLabel="Actualizar plan"
          accessibilityRole="button"
          hitSlop={10}
        >
          <Ionicons name="refresh" size={23} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {error && (
          <NoticeCard
            title="No se pudo comprobar tu licencia"
            message={error}
            action="Reintentar"
            onPress={() => {
              void refresh();
            }}
          />
        )}
        {!license && !error ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          license && (
            <>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.label, { color: colors.muted }]}>LICENCIA DE TU EMPRESA</Text>
                <Text style={[styles.plan, { color: colors.text }]}>{license.planName}</Text>
                <Text style={[styles.description, { color: colors.muted }]}>
                  {license.readOnly ? 'Solo consulta y exportación' : 'Licencia activa'}
                  {license.expiresOn ? ' · Válida hasta ' + license.expiresOn : ''}
                </Text>
                <Text style={[styles.description, { color: colors.text }]}>
                  {license.users.enabled} usuarios habilitados /{' '}
                  {license.users.limit ?? 'sin límite'}
                </Text>
              </View>
              {license.readOnly && (
                <NoticeCard
                  title={
                    license.state === 'expired'
                      ? 'Tu licencia venció'
                      : license.state === 'suspended'
                        ? 'Acceso de escritura suspendido'
                        : 'Tu usuario no tiene un cupo disponible'
                  }
                  message="Tus datos se conservan. Puedes consultar y exportar documentos. Contacta con soporte para renovar o ajustar el acceso."
                />
              )}
              <Text style={[styles.title, { color: colors.text }]}>Tus cupos</Text>
              {Object.entries(license.quotas).map(([meter, q]) => (
                <View
                  key={meter}
                  style={[
                    styles.quota,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={[styles.title, { color: colors.text }]}>
                      {labels[meter as keyof typeof labels]}
                    </Text>
                    <Text style={[styles.description, { color: colors.muted }]}>
                      {meter === 'scans'
                        ? 'Función aún no disponible'
                        : q.limit === null
                          ? 'Sin límite'
                          : q.period === 'lifetime'
                            ? 'Cupo total, por única vez'
                            : 'Cupo del mes'}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: colors.text }]}>
                    {q.used} / {q.limit ?? '∞'}
                  </Text>
                </View>
              ))}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.title, { color: colors.text }]}>Incluido en tu plan</Text>
                <Text style={[styles.description, { color: colors.muted }]}>
                  Datos de empresa y logo
                  {license.features.editDocuments ? '\nModificar documentos guardados' : ''}
                  {license.features.brandColors ? '\nPaleta de colores' : ''}
                </Text>
              </View>
              <PrimaryButton
                title={license.plan === 'free' ? 'Conocer Pro y Plus' : 'Renovar o cambiar de plan'}
                onPress={contact}
              />
              <Text style={[styles.description, { color: colors.muted, marginTop: 16 }]}>
                Los planes y cupos se comparten entre todos los usuarios de la empresa. Los cupos
                usados no se recuperan al borrar documentos.
              </Text>
            </>
          )
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  heading: { fontFamily: 'Poppins-SemiBold', fontSize: 19 },
  content: { padding: 22, gap: 16 },
  card: { padding: 22, gap: 12, borderWidth: 1, borderRadius: 20 },
  label: { fontFamily: 'Poppins', fontSize: 10, letterSpacing: 1 },
  plan: { fontFamily: 'Poppins-Bold', fontSize: 32 },
  description: { fontFamily: 'Poppins', fontSize: 12, lineHeight: 22 },
  title: { fontFamily: 'Poppins-SemiBold', fontSize: 14 },
  quota: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 17,
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
  },
  amount: { fontFamily: 'Poppins-SemiBold', fontSize: 15 },
});
