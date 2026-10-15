import * as SecureStore from 'expo-secure-store';

export const DEFAULT_UNITS = [
  'Unidad',
  'Metros',
  'Kg',
  'Rollo',
  'Barra',
  'Caja',
  'Par',
  'Pza',
  'Bolsa',
];

export const FALLBACK_UNIT = 'Unidad';

const keyFor = (userId: number) => `lumis_units_${userId}`;

export async function loadUnits(userId: number | null): Promise<string[]> {
  if (userId == null) return [...DEFAULT_UNITS];
  try {
    const stored = await SecureStore.getItemAsync(keyFor(userId));
    if (!stored) return [...DEFAULT_UNITS];
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      const units = parsed.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
      if (units.length > 0) return units;
    }
  } catch {
    // Sin almacenamiento disponible: se usan las unidades por defecto.
  }
  return [...DEFAULT_UNITS];
}

export async function saveUnits(userId: number | null, units: string[]): Promise<void> {
  if (userId == null) return;
  try {
    await SecureStore.setItemAsync(keyFor(userId), JSON.stringify(units));
  } catch {
    // Sin almacenamiento: los cambios viven solo en memoria.
  }
}

export function isValidUnitName(name: string, units: string[], editingUnit?: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Escribe un nombre para la unidad';
  if (trimmed.length > 20) return 'Máximo 20 caracteres';
  const exists = units.some(
    (u) => u.toLowerCase() === trimmed.toLowerCase() && u !== editingUnit,
  );
  if (exists) return `"${trimmed}" ya existe en la lista`;
  return null;
}
