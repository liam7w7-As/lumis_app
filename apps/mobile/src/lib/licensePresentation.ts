import type { CompanyLicense } from './api';

const DAY_MS = 24 * 60 * 60 * 1000;
const BOLIVIA_OFFSET_MS = -4 * 60 * 60 * 1000;

function expiryDateParts(expiresOn: string | null) {
  const match = expiresOn?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    return null;
  return { year, month, day, time: date.getTime() };
}

/** expiresOn is a calendar date; parsing it as a local timestamp can change its day. */
export function formatLicenseExpiry(expiresOn: string | null): string {
  if (expiresOn === null) return 'Sin vencimiento';
  const parts = expiryDateParts(expiresOn);
  if (!parts) return 'Fecha no disponible';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${String(parts.year).padStart(4, '0')}`;
}

export function licenseDaysRemaining(expiresOn: string | null, now = new Date()): number | null {
  const parts = expiryDateParts(expiresOn);
  if (!parts || !Number.isFinite(now.getTime())) return null;
  // The API expires plans at the end of the selected day in Bolivia, regardless of device time zone.
  const businessNow = new Date(now.getTime() + BOLIVIA_OFFSET_MS);
  const today = new Date(0);
  today.setUTCFullYear(businessNow.getUTCFullYear(), businessNow.getUTCMonth(), businessNow.getUTCDate());
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((parts.time - today.getTime()) / DAY_MS);
}

export function licenseStatusLabel(license: CompanyLicense): string {
  if (license.state === 'suspended') return 'Suspendido';
  if (license.state === 'expired') return 'Vencido';
  if (!license.hasSeat) return 'Solo consulta · Sin cupo';
  return license.readOnly ? 'Solo consulta' : 'Activo';
}

export function licenseExpiryMessage(license: CompanyLicense, now = new Date()): string {
  if (license.plan === 'free') return 'Cupos totales, por única vez';
  const days = licenseDaysRemaining(license.expiresOn, now);
  if (days === null) return 'Consulta el vencimiento con soporte';
  if (days < 0) return `Venció hace ${Math.abs(days)} ${days === -1 ? 'día' : 'días'}`;
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `${days <= 7 ? 'Vence pronto · ' : ''}Quedan ${days} días`;
}
