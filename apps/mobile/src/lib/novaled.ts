import { request } from './api';
import { NOVALED_PREFIX } from './backend';
export interface Page<T> { data: T[]; meta: { current_page: number; last_page: number } }
export interface MobileProduct { id: number; name: string; description: string | null; code: string; unit: string; price: number }
export interface MobileClient { id: number; name: string; phone: string | null; email: string | null }
export interface MobileQuote {
  id: number; number: number; version: number; rootId: number; previousId: number | null;
  clientId: number | null; clientName: string; branchId: number; branchName: string; sellerName: string;
  status: string; documentStatus: string; issuedAt: string; expiresAt: string; subtotal: number; savings: number;
  discount: number; discountPercent: number; discountAmount: number; discountPolicyId: number | null;
  discountValue: number; discountScope: 'global' | 'seleccion' | null; total: number;
  notes: string | null; terms: string | null; canRequote: boolean; canConvert: boolean;
  items?: { id: number; productId: number | null; name: string; description: string | null; quantity: number; unit: string; unitPrice: number; subtotal: number; applyDiscount: boolean }[];
}
export interface MobileCatalog {
  branches: { id: number; name: string; address: string | null }[];
  units: string[];
  discounts: { id: number; nombre: string; tipo: 'porcentaje' | 'monto'; valor: string; alcance_default: 'global' | 'seleccion' }[];
  today: string; validDays: number;
}
export interface QuoteSubmission {
  solicitud_id: string; tipo_documento: 'cotizacion'; sucursal_id: number;
  cliente_id: number | null; cliente_nombre: string; fecha_documento: string; fecha_vencimiento: string;
  metodo_pago: 'efectivo'; monto_pagado: 0; notas: string;
  recotizacion_de_id?: number; politica_descuento_id: number | null;
  descuento_valor?: number; descuento_alcance: 'global' | 'seleccion';
  descuento_global_porcentaje: number; descuento_global_monto: number;
  items: { articulo_id: number | null; nombre: string; descripcion?: string; cantidad: number; precio_unitario_venta: number; unidad_medida: string; aplica_descuento: boolean }[];
}
function query(params: Record<string, string | number | undefined>): string {
  const values = Object.entries(params).filter(([, value]) => value !== undefined && value !== '');
  return values.length ? '?' + values.map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(String(value))).join('&') : '';
}
export const novaled = {
  catalog: (token: string) => request<MobileCatalog>(NOVALED_PREFIX + '/catalog', { token }),
  products: (token: string, search = '', page = 1) => request<Page<MobileProduct>>(NOVALED_PREFIX + '/products' + query({ search, page }), { token }),
  clients: (token: string, search = '', page = 1) => request<Page<MobileClient>>(NOVALED_PREFIX + '/clients' + query({ search, page }), { token }),
  quotes: (token: string, search = '', page = 1, branchId?: number) => request<Page<MobileQuote>>(NOVALED_PREFIX + '/quotes' + query({ search, page, branchId }), { token }),
  quote: (id: number, token: string) => request<{ data: MobileQuote; versions: MobileQuote[] }>(NOVALED_PREFIX + '/quotes/' + id, { token }),
  create: (payload: QuoteSubmission, token: string) => request<{ data: MobileQuote }>(NOVALED_PREFIX + '/quotes', { method: 'POST', body: payload, token }),
  logout: (token: string) => request<{ ok: boolean }>(NOVALED_PREFIX + '/auth/logout', { method: 'POST', token }),
  sales: (token: string, search = '', page = 1, branchId?: number, paymentStatus?: string) => request<Page<MobileSale>>(NOVALED_PREFIX + '/sales' + query({ search, page, branchId, paymentStatus }), { token }),
  sale: (id: number, token: string) => request<{ data: MobileSale }>(NOVALED_PREFIX + '/sales/' + id, { token }),
  createSale: (body: SaleSubmission, token: string) => request<{ data: MobileSale }>(NOVALED_PREFIX + '/sales', { method: 'POST', body, token }),
  stock: (token: string, branchId: number, productIds: number[], quoteId?: number) => request<StockSnapshot>(NOVALED_PREFIX + '/stock' + query({ branchId, productIds: productIds.join(','), quoteId }), { token }),
  pay: (id: number, body: PaymentSubmission, token: string) => request<{ data: MobileSale }>(NOVALED_PREFIX + '/sales/' + id + '/payments', { method: 'POST', body, token }),
  prepareDelivery: (id: number, token: string) => request<{ data: MobileSale }>(NOVALED_PREFIX + '/sales/' + id + '/delivery-note', { method: 'POST', token }),
  deliver: (id: number, body: DeliverySubmission, token: string) => request<{ data: MobileSale }>(NOVALED_PREFIX + '/sales/' + id + '/delivery', { method: 'POST', body, token }),
};
export function decimalValue(value: string, label: string, minimum = 0): number {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) throw new Error(label + ': usa un número con hasta dos decimales.');
  const number = Number(value.replace(',', '.'));
  if (!Number.isFinite(number) || number < minimum || number > 99999999.99) throw new Error(label + ': revisa el importe.');
  return number;
}
export function addDays(date: string, days: number): string {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z'))
    && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
export function newSubmissionKey(): string {
  return 'lumis-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
}
export const quoteStatus: Record<string, string> = { aprobada: 'Vigente', pendiente: 'Pendiente', vencida: 'Vencida', reemplazada: 'Reemplazada', borrador: 'Borrador', anulada: 'Anulada', convertida: 'Convertida' };

export type PaymentMethod = 'efectivo' | 'transferencia' | 'qr' | 'tarjeta';
export interface PaymentSubmission { monto: number; metodo_pago: PaymentMethod; referencia_pago: string; clave_operacion: string }
export interface DeliverySubmission {
  fecha_entrega: string; recibido_por: string; observaciones_entrega: string; incluye_firma_empresa: boolean;
  monto: number; metodo_pago: PaymentMethod | null; referencia_pago: string; clave_operacion: string;
}
export interface MobileSale {
  id: number; number: number; quoteId: number | null; clientId: number | null; clientName: string;
  branchId: number; branchName: string; sellerName: string; status: string; paymentStatus: string; issuedAt: string;
  subtotal: number; savings: number; discount: number; total: number; paid: number; balance: number; notes: string | null;
  canPay: boolean; canDeliver: boolean;
  items?: { id: number; productId: number | null; name: string; description: string | null; quantity: number; unit: string; unitPrice: number; subtotal: number;
    sources: { sub_ubicacion_id: number | null; cantidad: number; ubicacion_nombre?: string }[] | null }[];
  payments?: { id: number; amount: number; method: string; reference: string | null; voided: boolean; date: string; userName: string }[];
  delivery: { id: number; number: number; status: string; date: string | null; receivedBy: string | null; notes: string | null } | null;
  paymentProof: { id: number; number: number } | null;
}
export interface SaleSubmission extends Omit<QuoteSubmission, 'tipo_documento' | 'fecha_documento' | 'fecha_vencimiento' | 'recotizacion_de_id' | 'monto_pagado' | 'metodo_pago' | 'items'> {
  tipo_documento: 'nota_venta'; monto_pagado: number; metodo_pago: PaymentMethod; documento_origen_id?: number;
  pagos?: { monto: number; metodo_pago: PaymentMethod; referencia_pago?: string }[];
  items: (QuoteSubmission['items'][number] & { salidas_stock: { sub_ubicacion_id: number | null; cantidad: number }[];
    entrada_manual?: { cantidad: number; costo_unitario: number; motivo: string } })[];
}
export interface StockSnapshot {
  branchId: number; usesLocations: boolean; locations: { id: number | null; name: string }[];
  products: { id: number; quantity: number; canManualEntry: boolean;
    sources: { locationId: number | null; name: string; quantity: number }[] }[];
}
export function newOperationUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });
}
export const paymentStatus: Record<string, string> = { pagado: 'Pagado', parcial: 'Pago parcial', por_cobrar: 'Por cobrar', anulado: 'Anulado' };
export const paymentMethods: { id: PaymentMethod; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' }, { id: 'qr', label: 'QR' }, { id: 'transferencia', label: 'Transferencia' }, { id: 'tarjeta', label: 'Tarjeta' },
];
