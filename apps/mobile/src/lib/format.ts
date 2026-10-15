import { CURRENCY } from '../config';

export function formatMoney(value: number): string {
  const formatted = new Intl.NumberFormat(CURRENCY.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${CURRENCY.symbol} ${formatted}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const AVATAR_COLORS = ['#5b3df5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
