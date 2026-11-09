import { decimalValue, type StockSnapshot } from './novaled';
export interface StockLine {
  key: string; productId: number | null; quantity: string; sources?: Record<string, string>;
  entry?: { quantity: string; cost: string; reason: string; locationId: number | null };
}
export function sourceKey(id: number | null): string { return id === null ? 'general' : String(id); }
function number(value: string): number { return Math.max(0, Math.round((Number(value.replace(',', '.')) || 0) * 100)); }
function productKey(item: StockLine): string { return item.productId === null ? 'free-' + item.key : String(item.productId); }

/** Manual selections reserve stock first; repeated product rows share the same available quantity. */
export function suggestSources(lines: StockLine[], stock: StockSnapshot): Record<string, Record<string, string>> {
  const available = new Map<string, number>();
  for (const product of stock.products) for (const source of product.sources) available.set(product.id + ':' + sourceKey(source.locationId), Math.round(source.quantity * 100));
  for (const item of lines) if (item.entry) {
    const key = productKey(item) + ':' + sourceKey(item.entry.locationId);
    available.set(key, (available.get(key) ?? 0) + number(item.entry.quantity));
  }
  for (const item of lines) if (item.sources) for (const [id, value] of Object.entries(item.sources)) {
    const key = productKey(item) + ':' + id; available.set(key, (available.get(key) ?? 0) - number(value));
  }
  const result: Record<string, Record<string, string>> = {};
  for (const item of lines) {
    if (item.sources) { result[item.key] = item.sources; continue; }
    result[item.key] = {};
    let demand = number(item.quantity);
    const product = stock.products.find(product => product.id === item.productId);
    const ids = [...new Set([...(product?.sources.map(source => sourceKey(source.locationId)) ?? []), ...(item.entry ? [sourceKey(item.entry.locationId)] : [])])];
    for (const id of ids) {
      const key = productKey(item) + ':' + id;
      const take = Math.min(demand, Math.max(0, available.get(key) ?? 0));
      if (take > 0) result[item.key][id] = String(take / 100);
      available.set(key, (available.get(key) ?? 0) - take); demand -= take;
    }
  }
  return result;
}
export function saleSources(item: StockLine, sources: Record<string, string>, stock: StockSnapshot): { sub_ubicacion_id: number | null; cantidad: number }[] {
  const rows = Object.entries(sources).filter(([, value]) => value.trim() !== '' && value !== '0').map(([key, value]) => {
    const id = key === 'general' ? null : Number(key);
    if (!stock.locations.some(location => location.id === id)) throw new Error('Elige ubicaciones activas de la sucursal seleccionada.');
    return { sub_ubicacion_id: id, cantidad: decimalValue(value, 'Cantidad por ubicación') };
  }).filter(source => source.cantidad > 0);
  const total = rows.reduce((sum, source) => sum + Math.round(source.cantidad * 100), 0);
  if (total !== number(item.quantity)) throw new Error('Reparte toda la cantidad del producto entre sus ubicaciones. Si falta stock, revisa el origen o registra una entrada autorizada.');
  if (item.entry) rows.sort((a, b) => Number(b.sub_ubicacion_id === item.entry!.locationId) - Number(a.sub_ubicacion_id === item.entry!.locationId));
  return rows;
}
