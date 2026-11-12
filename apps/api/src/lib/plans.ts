export type PlanId = 'free' | 'pro' | 'plus';
export type Meter = 'quotes' | 'sales' | 'deliveries' | 'scans';
export const PLANS = {
  free: {
    id: 'free',
    name: 'Gratis',
    price: 0,
    users: 2,
    editDocuments: false,
    brandColors: false,
    limits: { quotes: 5, sales: 5, deliveries: 5, scans: 5 },
    scansPeriod: 'lifetime',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 95,
    users: 6,
    editDocuments: true,
    brandColors: true,
    limits: { quotes: null, sales: null, deliveries: null, scans: 50 },
    scansPeriod: 'monthly',
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    price: 170,
    users: null,
    editDocuments: true,
    brandColors: true,
    limits: { quotes: null, sales: null, deliveries: null, scans: 200 },
    scansPeriod: 'monthly',
  },
} as const;

// Fecha inclusiva del calendario de Bolivia, almacenada como instante UTC exclusivo.
export function expiryFromDay(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Fecha inválida');
  if (Number(day.slice(0, 4)) < 2000 || Number(day.slice(0, 4)) > 2100)
    throw new Error('Fecha fuera del rango admitido');
  const date = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day)
    throw new Error('Fecha inválida');
  return new Date(date.getTime() + 28 * 60 * 60 * 1000);
}
export function expiryDay(value: Date | string | null): string | null {
  if (!value) return null;
  return new Date(new Date(value).getTime() - 28 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function licenseState(
  plan: PlanId,
  status: string,
  expiresAt: Date | string | null,
  now = new Date(),
) {
  if (status === 'suspended') return 'suspended';
  if (plan !== 'free' && (!expiresAt || new Date(expiresAt).getTime() <= now.getTime()))
    return 'expired';
  return 'active';
}
export function monthKey(now = new Date()) {
  return new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
