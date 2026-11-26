import type { DraftItem } from '../context/DraftContext';
import type { QuoteItemInput } from './api';

export type QuoteDraftField = 'name' | 'quantity' | 'unitPrice' | 'unit';
export type QuoteDraftErrors = Partial<Record<QuoteDraftField, string>>;

const MAX_QUANTITY = 99999999.99;
const MAX_AMOUNT = 9999999999.99;
const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

/** A trailing decimal separator is allowed while typing; empty and partial numbers stay invalid. */
export function parseQuoteDraftDecimal(text: string): number | null {
  const value = text.trim();
  if (!/^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(value)) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function quoteDraftNameLimit(item: DraftItem): number {
  return !item.fromScan && item.createProduct && item.productId == null ? 150 : 255;
}

export function quoteDraftNumberText(item: DraftItem, field: 'quantity' | 'unitPrice'): string {
  const raw = field === 'quantity' ? item.quantityText : item.unitPriceText;
  if (raw === undefined && field === 'quantity' && item.fromScan && item.quantity === 0) return '';
  return raw ?? String(item[field]);
}

function numbers(item: DraftItem) {
  const number = (field: 'quantity' | 'unitPrice') => {
    const text = quoteDraftNumberText(item, field);
    return item.fromScan && !text.trim() ? 0 : parseQuoteDraftDecimal(text);
  };
  return {
    quantity: number('quantity'),
    unitPrice: number('unitPrice'),
  };
}

export function quoteDraftErrors(item: DraftItem): QuoteDraftErrors {
  const errors: QuoteDraftErrors = {};
  const name = item.name.trim(), limit = quoteDraftNameLimit(item);
  const { quantity, unitPrice } = numbers(item);
  if (!name && !item.fromScan) errors.name = 'Escribe el nombre del artículo.';
  else if (name.length > limit) errors.name = `El nombre admite hasta ${limit} caracteres.`;
  if (quantity === null || (item.fromScan ? quantity < 0 : quantity <= 0)) errors.quantity = 'Escribe una cantidad válida, con hasta 2 decimales.';
  else if (quantity > MAX_QUANTITY) errors.quantity = 'La cantidad supera el máximo permitido.';
  if (unitPrice === null || unitPrice < 0) errors.unitPrice = 'Escribe un precio válido, con hasta 2 decimales.';
  else if (unitPrice > MAX_AMOUNT) errors.unitPrice = 'El precio supera el máximo permitido.';
  if ((!item.unit.trim() && !item.fromScan) || item.unit.trim().length > 20) errors.unit = 'Elige una unidad de hasta 20 caracteres.';
  if (!errors.quantity && !errors.unitPrice && quantity !== null && unitPrice !== null
    && roundMoney(quantity * unitPrice) > MAX_AMOUNT) {
    errors.unitPrice = 'El subtotal supera el máximo permitido. Revisa la cantidad y el precio.';
  }
  return errors;
}

export function quoteDraftSubtotal(item: DraftItem): number | null {
  const errors = quoteDraftErrors(item);
  if (errors.quantity || errors.unitPrice) return null;
  const { quantity, unitPrice } = numbers(item);
  return roundMoney(quantity! * unitPrice!);
}

export class QuoteDraftValidationError extends Error {
  constructor(public readonly key: string, public readonly field: QuoteDraftField, message: string) {
    super(message);
    this.name = 'QuoteDraftValidationError';
  }
}

/** Takes the latest text, including a currently focused input; never restores a stale numeric value. */
export function buildQuoteItems(items: DraftItem[]): QuoteItemInput[] {
  let total = 0;
  return items.map((item, index) => {
    if (index >= 200) throw new QuoteDraftValidationError(item.key, 'name', 'La cotización admite hasta 200 artículos.');
    const errors = quoteDraftErrors(item);
    const field = (['name', 'quantity', 'unitPrice', 'unit'] as const).find(key => errors[key]);
    if (field) throw new QuoteDraftValidationError(item.key, field, `Artículo ${index + 1}: ${errors[field]}`);
    const { quantity, unitPrice } = numbers(item);
    total = roundMoney(total + quoteDraftSubtotal(item)!);
    if (total > MAX_AMOUNT) throw new QuoteDraftValidationError(item.key, 'unitPrice', 'El total de la cotización supera el máximo permitido. Revisa los importes.');
    return {
      ...(item.fromScan ? { fromScan: true } : {}),
      productId: item.productId, description: item.name.trim(), quantity: quantity!, unit: item.unit.trim(),
      unitPrice: unitPrice!, marca: item.marca?.trim() || null, procedencia: item.procedencia?.trim() || null,
      ...(item.createProduct !== undefined ? { createProduct: item.fromScan
        ? item.createProduct && !!item.name.trim() && item.name.trim().length <= 150 && !!item.unit.trim()
        : item.createProduct } : {}),
    };
  });
}
