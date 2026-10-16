/** Cambia el día local sin interpretar YYYY-MM-DD como medianoche UTC. */
export function replaceLocalDate(iso: string, year: number, month: number, day: number): string {
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) throw new Error('La fecha original no es válida.');
  value.setFullYear(year, month, day);
  if (value.getFullYear() !== year || value.getMonth() !== month || value.getDate() !== day) {
    throw new Error('Selecciona una fecha válida.');
  }
  return value.toISOString();
}
