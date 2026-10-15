export type DashboardPeriod = 'hoy' | 'semana' | 'mes';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// El negocio opera en Bolivia (UTC-4, sin cambio estacional).
const BOLIVIA_OFFSET = -4 * HOUR;
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function dashboardRange(period: DashboardPeriod, now = new Date()) {
  const local = new Date(now.getTime() + BOLIVIA_OFFSET);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const today = Date.UTC(year, month, day) - BOLIVIA_OFFSET;
  let start = today;
  let end = today + DAY;
  let previousStart = today - DAY;
  let bucketMs = 4 * HOUR;
  let labels = ['00h', '04h', '08h', '12h', '16h', '20h'];
  let comparison = 'Comparado con ayer';

  if (period === 'semana') {
    start = today - ((local.getUTCDay() + 6) % 7) * DAY;
    end = start + 7 * DAY;
    previousStart = start - 7 * DAY;
    bucketMs = DAY;
    labels = DAYS;
    comparison = 'Comparado con la semana anterior';
  } else if (period === 'mes') {
    start = Date.UTC(year, month, 1) - BOLIVIA_OFFSET;
    end = Date.UTC(year, month + 1, 1) - BOLIVIA_OFFSET;
    previousStart = Date.UTC(year, month - 1, 1) - BOLIVIA_OFFSET;
    bucketMs = 7 * DAY;
    const days = (end - start) / DAY;
    labels = Array.from({ length: Math.ceil(days / 7) }, (_, i) =>
      `${i * 7 + 1}–${Math.min((i + 1) * 7, days)}`,
    );
    comparison = 'Comparado con el mes anterior';
  }

  return { start, end, previousStart, bucketMs, labels, comparison };
}

export function dashboardStat(value: number, previousValue: number) {
  return {
    value,
    previousValue,
    changePercent: previousValue === 0
      ? (value === 0 ? 0 : null)
      : Math.round(((value - previousValue) / previousValue) * 1000) / 10,
  };
}

export interface QuoteStatsRow {
  current_period: number;
  total: number | string;
  approved: number | string;
}

export interface SaleStatsRow {
  current_period: number;
  bucket: number;
  total: number | string;
  receivable: number | string;
}

export function assembleDashboard(
  period: DashboardPeriod,
  now: Date,
  quoteRows: QuoteStatsRow[],
  saleRows: SaleStatsRow[],
) {
  const range = dashboardRange(period, now);
  const counts = { quotes: [0, 0], approved: [0, 0], sales: [0, 0], receivable: [0, 0] };
  const chart = range.labels.map((label) => ({ label, value: 0 }));
  for (const row of quoteRows) {
    const index = Number(row.current_period) === 1 ? 1 : 0;
    counts.quotes[index] += Number(row.total);
    counts.approved[index] += Number(row.approved);
  }
  for (const row of saleRows) {
    const index = Number(row.current_period) === 1 ? 1 : 0;
    counts.sales[index] += Number(row.total);
    counts.receivable[index] += Number(row.receivable);
    if (index === 1 && chart[row.bucket]) chart[row.bucket].value += Number(row.total);
  }
  return {
    period,
    timeZone: 'America/La_Paz',
    comparison: range.comparison,
    updatedAt: now.toISOString(),
    quotes: dashboardStat(counts.quotes[1], counts.quotes[0]),
    approved: dashboardStat(counts.approved[1], counts.approved[0]),
    sales: dashboardStat(counts.sales[1], counts.sales[0]),
    receivable: dashboardStat(counts.receivable[1], counts.receivable[0]),
    chart,
  };
}
