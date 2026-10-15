import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export interface BarDatum {
  label: string;
  value: number;
}

const PLOT_HEIGHT = 104;

export function MiniBarChart({ data }: { data: BarDatum[] }) {
  const { colors } = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  const mid = max / 2;

  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  return (
    <View style={styles.plot}>
      <View style={[styles.yAxis, { height: PLOT_HEIGHT }]}>
        <Text style={[styles.yLabel, { color: colors.muted }]}>{fmt(max)}</Text>
        <Text style={[styles.yLabel, { color: colors.muted }]}>{fmt(mid)}</Text>
        <Text style={[styles.yLabel, { color: colors.muted }]}>0</Text>
      </View>
      <View style={styles.barsArea}>
        <View style={[styles.gridLine, { borderTopColor: colors.border, top: 0 }]} />
        <View style={[styles.gridLine, { borderTopColor: colors.border, top: PLOT_HEIGHT / 2 }]} />
        <View style={[styles.gridLine, { borderTopColor: colors.border, top: PLOT_HEIGHT }]} />
        <View style={[styles.bars, { height: PLOT_HEIGHT }]}>
          {data.map((d) => (
            <View key={d.label} style={styles.column}>
              <View
                style={[
                  styles.bar,
                  {
                    backgroundColor: colors.primary,
                    height: 6 + (d.value / max) * (PLOT_HEIGHT - 12),
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.xLabels}>
          {data.map((d) => (
            <View key={d.label} style={styles.column}>
              <Text style={[styles.xLabel, { color: colors.muted }]} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    flexDirection: 'row',
    gap: 6,
  },
  yAxis: {
    justifyContent: 'space-between',
    paddingBottom: 0,
  },
  yLabel: {
    fontSize: 10,
    fontFamily: 'Poppins',
    lineHeight: 12,
  },
  barsArea: {
    flex: 1,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  bar: {
    width: 10,
    borderRadius: 5,
  },
  xLabels: {
    flexDirection: 'row',
    marginTop: 6,
  },
  xLabel: {
    fontSize: 10,
    fontFamily: 'Poppins',
  },
});
