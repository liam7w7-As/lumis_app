import { feedback } from '../lib/feedback';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusiness } from '../context/BusinessContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { gradientFor } from '../lib/brandColors';
import { GradientCard } from '../components/GradientCard';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { MiniBarChart } from '../components/MiniBarChart';
import { Logo } from '../components/Logo';
import { api, ApiError, type DashboardPeriod, type DashboardStat, type DashboardStats } from '../lib/api';

const PERIODS: { key: DashboardPeriod; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
];

function StatCard({
  icon,
  stat,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  stat: DashboardStat;
  label: string;
}) {
  const { colors } = useTheme();
  const change = stat.changePercent;
  const delta = change === null ? 'Sin base previa'
    : change === 0 ? 'Sin cambio' : `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}%`;
  return (
    <View style={[styles.statCard, { borderColor: colors.border }]}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statDelta, { color: colors.muted }]}>{delta}</Text>
    </View>
  );
}

export function DashboardScreen() {
  const { user, token } = useAuth();
  const { colors, dark } = useTheme();
  const { changeMode } = useBusiness();
  const [changingMode, setChangingMode] = useState(false);
  const toggle = async () => {
    if (changingMode) return;
    setChangingMode(true);
    try { await changeMode(dark ? 'light' : 'dark'); }
    catch (err) { feedback.alert('Apariencia', err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setChangingMode(false); }
  };
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<DashboardPeriod>('semana');
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const loadedPeriod = useRef<DashboardPeriod | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!token) return;
    const request = ++requestId.current;
    setLoading(!refresh && loadedPeriod.current !== period);
    setRefreshing(refresh);
    setError(null);
    try {
      const { dashboard } = await api.dashboard(token, period);
      if (request === requestId.current) {
        loadedPeriod.current = period;
        setData(dashboard);
      }
    } catch (err) {
      if (request === requestId.current) {
        const message = err instanceof ApiError ? err.message : 'No se pudieron cargar las estadísticas.';
        setError(message);
        feedback.error('No se pudo actualizar el dashboard', message);
      }
    } finally {
      if (request === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token, period]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]));

  const firstName = user?.name?.split(' ')[0] || user?.username || '';
  const stats = data?.period === period ? data : null;
  const gradient = useMemo(() => gradientFor(colors.primary), [colors.primary]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <View style={styles.header}>
          <Logo size={26} imageOnly />
          <View style={styles.headerActions}>
            <Pressable
              onPress={toggle}
              disabled={changingMode}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
            >
              <Ionicons
                name={dark ? 'sunny-outline' : 'moon-outline'}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
              <Ionicons name="settings-outline" size={24} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <Text style={[styles.greeting, { color: colors.text }]}>Hola, {firstName}!</Text>

        <View style={styles.cards}>
          <GradientCard
            title="Cotizaciones"
            gradient={gradient}
            textColor={colors.onPrimary}
            onPress={() => router.push('/quotes')}
          >
            <Ionicons name="cart-outline" size={30} color={colors.onPrimary} />
          </GradientCard>
          <GradientCard
            title="Punto de venta"
            gradient={gradient}
            textColor={colors.onPrimary}
            onPress={() => router.push('/pos')}
          >
            <Text style={[styles.dollar, { color: colors.onPrimary }]}>$</Text>
          </GradientCard>
        </View>

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: 24 + insets.bottom },
          ]}
        >
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Estadísticas</Text>
            <SegmentedTabs<DashboardPeriod> options={PERIODS} value={period} onChange={setPeriod} />
          </View>

          {error && (
            <View style={styles.feedback}>
              <Text style={{ color: colors.error }}>{error}</Text>
              <Pressable onPress={() => void load()} accessibilityRole="button">
                <Text style={{ color: colors.primary }}>Reintentar</Text>
              </Pressable>
            </View>
          )}
          {loading && !stats && <ActivityIndicator style={styles.feedback} size="large" color={colors.primary} />}
          {stats && (
            <>
              <Text style={[styles.caption, { color: colors.muted }]}>{stats.comparison}</Text>
              <View style={styles.statGrid}>
                <StatCard icon="document-text-outline" stat={stats.quotes} label="Cotizaciones" />
                <StatCard icon="checkmark-circle-outline" stat={stats.approved} label="Aprobadas" />
                <StatCard icon="bag-outline" stat={stats.sales} label="Ventas" />
                <StatCard icon="card-outline" stat={stats.receivable} label="Por cobrar" />
              </View>
              <View style={[styles.chartCard, { borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Ventas · cantidad</Text>
                <MiniBarChart data={stats.chart} />
                {stats.sales.value === 0 && <Text style={[styles.caption, { color: colors.muted }]}>Sin ventas en este período</Text>}
              </View>
              <Text style={[styles.caption, { color: colors.muted }]}>
                Operaciones creadas en el período, en horario de Bolivia. Ventas activas; «Por cobrar» cuenta las pendientes de pago. La comparación usa el período anterior completo y los estados actuales.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  greeting: {
    fontSize: 28,
    fontFamily: 'Poppins',
    fontWeight: '800',
    paddingHorizontal: 24,
    marginTop: 16,
  },
  cards: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  dollar: {
    color: '#fff',
    fontSize: 30,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  sheet: {
    flex: 1,
    marginTop: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  sheetHead: {
    gap: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  statCard: {
    flexBasis: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 3,
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Poppins',
  },
  statDelta: {
    fontSize: 11,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  caption: { fontFamily: 'Poppins', fontSize: 11, marginTop: 12 },
  feedback: { paddingVertical: 24, gap: 12, alignItems: 'center' },
  chartCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: 'Poppins',
    fontWeight: '700',
    marginBottom: 10,
  },
});
