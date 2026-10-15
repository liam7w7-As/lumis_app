import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { gradientFor } from '../lib/brandColors';
import { GradientCard } from '../components/GradientCard';
import { SegmentedTabs } from '../components/SegmentedTabs';
import { MiniBarChart } from '../components/MiniBarChart';
import { Logo } from '../components/Logo';

type Period = 'hoy' | 'semana' | 'mes';

interface Stat {
  value: number;
  delta: string;
}

interface PeriodStats {
  quotes: Stat;
  approved: Stat;
  sales: Stat;
  receivable: Stat;
  chart: number[];
}

// Datos de muestra: se conectarán al backend cuando se definan los endpoints.
const STATS: Record<Period, PeriodStats> = {
  hoy: {
    quotes: { value: 1, delta: '↑ 100%' },
    approved: { value: 0, delta: '↑ 0%' },
    sales: { value: 0, delta: '↑ 0%' },
    receivable: { value: 0, delta: '↑ 0%' },
    chart: [0, 1, 0, 0, 0, 0, 0],
  },
  semana: {
    quotes: { value: 3, delta: '↑ 200%' },
    approved: { value: 0, delta: '↑ 0%' },
    sales: { value: 0, delta: '↑ 0%' },
    receivable: { value: 0, delta: '↑ 0%' },
    chart: [1, 2, 1, 0, 0, 0, 0],
  },
  mes: {
    quotes: { value: 12, delta: '↑ 50%' },
    approved: { value: 7, delta: '↑ 40%' },
    sales: { value: 5, delta: '↑ 25%' },
    receivable: { value: 2, delta: '↑ 10%' },
    chart: [3, 5, 2, 6, 4, 7, 5],
  },
};

const PERIODS: { key: Period; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
];

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function StatCard({
  icon,
  value,
  label,
  delta,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  delta: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statCard, { borderColor: colors.border }]}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={styles.statDelta}>{delta}</Text>
    </View>
  );
}

export function DashboardScreen() {
  const { user } = useAuth();
  const { colors, dark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('semana');

  const firstName = user?.name?.split(' ')[0] || user?.username || '';
  const stats = STATS[period];
  const gradient = useMemo(() => gradientFor(colors.primary), [colors.primary]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Logo size={26} />
          <View style={styles.headerActions}>
            <Pressable
              onPress={toggle}
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
            <SegmentedTabs options={PERIODS} value={period} onChange={setPeriod} />
          </View>

          <View style={styles.statGrid}>
            <StatCard icon="document-text-outline" value={stats.quotes.value} label="Cotizaciones" delta={stats.quotes.delta} />
            <StatCard icon="checkmark-circle-outline" value={stats.approved.value} label="Aprobadas" delta={stats.approved.delta} />
            <StatCard icon="bag-outline" value={stats.sales.value} label="Ventas" delta={stats.sales.delta} />
            <StatCard icon="card-outline" value={stats.receivable.value} label="Por cobrar" delta={stats.receivable.delta} />
          </View>

          <View style={[styles.chartCard, { borderColor: colors.border }]}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>Ventas</Text>
            <MiniBarChart
              data={DAYS.map((label, i) => ({ label, value: stats.chart[i] ?? 0 }))}
            />
          </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Poppins',
    fontWeight: '700',
  },
  statGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statCard: {
    flex: 1,
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
    color: '#22c55e',
  },
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
