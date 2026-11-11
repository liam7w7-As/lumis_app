export interface StockChoiceItem {
  index: number; name: string; quantity: number; unit: string; canEntry: boolean;
  sources: { locationId: number | null; name: string; quantity: number; default?: boolean }[];
}
export type StockSelections = Record<string,{ sources: { sub_ubicacion_id: number | null; cantidad: number }[]; entry?: { cantidad: number; costo_unitario: number; motivo: string } }>;
type SelectionRequest = { items: StockChoiceItem[]; resolve: (result: StockSelections | null) => void };
let current: SelectionRequest | null = null; const listeners = new Set<() => void>();
export const getStockSelection = () => current;
export function subscribeStockSelection(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish() { for (const listener of listeners) listener(); }
export function requestStockSelection(items: StockChoiceItem[]): Promise<StockSelections | null> {
  if (current) return Promise.reject(Error('Completa primero la selección de existencias que está abierta.'));
  return new Promise(resolve => { current = { items,resolve }; publish(); });
}
export function finishStockSelection(value: StockSelections | null) { const request = current; current = null; publish(); request?.resolve(value); }
