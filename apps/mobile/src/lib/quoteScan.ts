import type { Product, QuoteScanLine } from './api';

export interface ScannedQuoteItem {
  productId: number | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  marca: string | null;
  procedencia: string | null;
  codigoInterno?: string | null;
  createProduct?: boolean;
}

export interface ScanReviewRow {
  key: string;
  source: QuoteScanLine;
  included: boolean;
  mode: 'catalog' | 'new';
  productId: number | null;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

export function scanFieldText(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return /^(?:null|undefined)$/i.test(text) ? '' : text;
}

export function selectScanProduct(row: ScanReviewRow, product: Product): ScanReviewRow {
  if (row.mode === 'catalog' && row.productId === product.id) return row;
  return { ...row, mode: 'catalog', productId: product.id, name: scanFieldText(product.name),
    unit: scanFieldText(product.unit), unitPrice: scanFieldText(product.price) };
}

export function newScanProduct(row: ScanReviewRow): ScanReviewRow {
  if (row.mode === 'new') return row;
  return { ...row, mode: 'new', productId: null, name: scanFieldText(row.source.name), unit: scanFieldText(row.source.unit),
    unitPrice: scanFieldText(row.source.unitPrice) };
}

export function reviewScanLines(lines: QuoteScanLine[]): ScanReviewRow[] {
  return lines.map((raw, index) => {
    const source = { ...raw, name: scanFieldText(raw.name), unit: scanFieldText(raw.unit) || null,
      codigoInterno: scanFieldText(raw.codigoInterno) || null };
    const row: ScanReviewRow = {
      key: String(index), source, included: true,
      mode: source.candidates.length ? 'catalog' : 'new', productId: null,
      name: source.name, quantity: scanFieldText(source.quantity),
      unit: scanFieldText(source.unit), unitPrice: scanFieldText(source.unitPrice),
    };
    // A suggestion is never silently treated as a confirmed match.
    const exact = source.match === 'exact'
      ? source.candidates.find(product => product.id === source.selectedProductId) : undefined;
    return exact ? selectScanProduct(row, exact) : row;
  });
}

function decimal(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(trimmed)) return null;
  const result = Number(trimmed.replace(',', '.'));
  return Number.isFinite(result) && result <= 99999999.99 ? result : null;
}

export function scanReviewError(row: ScanReviewRow): string | null {
  if (!row.included) return null;
  const nameLimit = row.mode === 'new' ? 150 : 255;
  if (!row.name.trim() || row.name.trim().length > nameLimit) return `Indica un nombre de hasta ${nameLimit} caracteres.`;
  const quantity = decimal(row.quantity);
  if (quantity === null || quantity <= 0) return 'Indica una cantidad mayor a cero, con hasta 2 decimales.';
  if (row.mode === 'catalog' && !row.source.candidates.some(product => product.id === row.productId))
    return 'Selecciona un producto del catálogo o elige «Crear producto nuevo».';
  if (!row.unit.trim() || row.unit.trim().length > 20) return 'Indica una unidad de hasta 20 caracteres.';
  if (decimal(row.unitPrice) === null) return 'Indica un precio válido, con hasta 2 decimales.';
  return null;
}

export function scannedQuoteItems(rows: ScanReviewRow[]): ScannedQuoteItem[] {
  const selected = rows.filter(row => row.included);
  if (!selected.length) throw new Error('Selecciona al menos un producto para añadir.');
  for (const [index, row] of rows.entries()) {
    if (!row.included) continue;
    const error = scanReviewError(row);
    if (error) throw new Error(`Producto ${index + 1}: ${error}`);
  }
  return selected.map(row => {
    const product = row.mode === 'catalog'
      ? row.source.candidates.find(candidate => candidate.id === row.productId) : undefined;
    return {
      productId: product?.id ?? null,
      name: row.name.trim(), quantity: decimal(row.quantity)!, unit: row.unit.trim(),
      unitPrice: decimal(row.unitPrice)!, marca: scanFieldText(product?.marca) || null,
      procedencia: scanFieldText(product?.procedencia) || null,
      codigoInterno: scanFieldText(product?.codigoInterno ?? row.source.codigoInterno) || null,
      ...(product ? {} : { createProduct: true }),
    };
  });
}

/** UUID used only for idempotent retries, never as an authorization secret. */
export function newQuoteScanId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 3) | 8).toString(16);
  });
}
