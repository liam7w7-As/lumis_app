export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith('file:')) return path;
  return `${API_URL}${path}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface User {
  id: number;
  name: string;
  username: string;
  email: string | null;
}

export type QuoteStatus = 'borrador' | 'aprobada' | 'rechazada' | 'convertida';

export interface Quote {
  id: number;
  clientId: number | null;
  clientName: string | null;
  status: QuoteStatus;
  total: number;
  createdAt: string;
  sellerName: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  unit: string;
  codigoInterno: string | null;
  marca: string | null;
  procedencia: string | null;
}

export interface Business {
  id: number;
  nombre: string;
  color_primario: string;
  moneda: string;
  logo_url: string | null;
  sello_url: string | null;
  terminos_default: string | null;
  redes_sociales: string | null;
  website: string | null;
  direccion: string | null;
  ciudad: string | null;
  nit: string | null;
  email: string | null;
  telefono: string | null;
}

export interface BusinessUpdateInput {
  nombre?: string;
  color_primario?: string;
  moneda?: string;
  logo_url?: string | null;
  sello_url?: string | null;
  terminos_default?: string | null;
  redes_sociales?: string | null;
  website?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  nit?: string | null;
  email?: string | null;
  telefono?: string | null;
}

export interface Branch {
  id: number;
  name: string;
  address: string | null;
}

export interface Agent {
  id: number;
  name: string;
}

export type SaleEstadoPago = 'por_cobrar' | 'pagado';
export type SaleMetodoPago = 'efectivo' | 'qr' | 'transferencia' | 'por_pagar';
export type SaleEstado = 'activa' | 'anulada';

export interface Sale {
  id: number;
  clientId: number | null;
  clientName: string | null;
  branchId: number | null;
  branchName: string | null;
  total: number;
  estadoPago: SaleEstadoPago;
  metodoPago: SaleMetodoPago;
  estado: SaleEstado;
  anuladoAt: string | null;
  entregadaAt: string | null;
  createdAt: string;
  sellerName: string;
}

export interface SaleItem {
  id: number;
  productId: number | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  codigoInterno: string | null;
  marca: string | null;
  procedencia: string | null;
}

export interface SalePayment {
  id: number;
  monto: number;
  nota: string | null;
  createdAt: string;
}

export interface SaleDetail extends Sale {
  client: { id: number; name: string; phone: string | null; email: string | null } | null;
  agentId: number | null;
  comprobanteUrl: string | null;
  notaPago: string | null;
  transferenciaNumero: string | null;
  includeSello: boolean;
  totalPagado: number;
  payments: SalePayment[];
  items: SaleItem[];
}

export interface SaleUpdateInput {
  estadoPago?: SaleEstadoPago;
  metodoPago?: SaleMetodoPago;
  clientId?: number | null;
  branchId?: number | null;
  agentId?: number | null;
  notaPago?: string | null;
  transferenciaNumero?: string | null;
  comprobanteUrl?: string | null;
  includeSello?: boolean;
}

export interface SaleFilters {
  estadoPago?: SaleEstadoPago;
  /** Por defecto el punto de venta solo lista ventas activas. */
  estadoVenta?: SaleEstado;
  branchId?: number | null;
  search?: string;
}

export interface QuoteItem {
  id: number;
  productId: number | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  codigoInterno: string | null;
  marca: string | null;
  procedencia: string | null;
}

export interface QuoteDetail {
  id: number;
  clientId: number | null;
  client: { id: number; name: string; phone: string | null; email: string | null } | null;
  branchId: number | null;
  branchName: string | null;
  status: QuoteStatus;
  notes: string | null;
  includeSeal: boolean;
  showNotes: boolean;
  includeSignature: boolean;
  versionNumero: number;
  fechaVencimiento: string | null;
  terminos: string | null;
  total: number;
  createdAt: string;
  sellerName: string;
  items: QuoteItem[];
}

export interface QuoteItemInput {
  productId?: number | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  codigoInterno?: string | null;
  marca?: string | null;
  procedencia?: string | null;
}

export interface QuoteUpdateInput {
  status?: 'borrador' | 'aprobada' | 'rechazada';
  notes?: string | null;
  includeSeal?: boolean;
  showNotes?: boolean;
  includeSignature?: boolean;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError(0, `No se pudo conectar con la API (${API_URL})`);
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Error ${res.status}`);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; service: string; time: string }>('/health'),
  register: (input: { username: string; name: string; password: string }) =>
    request<{ user: User; token: string }>('/api/auth/register', {
      method: 'POST',
      body: input,
    }),
  login: (input: { username: string; password: string }) =>
    request<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: input,
    }),
  me: (token: string) => request<{ user: User }>('/api/auth/me', { token }),
  quotes: (token: string) => request<{ quotes: Quote[] }>('/api/quotes', { token }),
  duplicateQuote: (id: number, token: string) =>
    request<{ quote: { id: number } }>(`/api/quotes/${id}/duplicate`, {
      method: 'POST',
      token,
    }),
  deleteQuote: (id: number, token: string) =>
    request<unknown>(`/api/quotes/${id}`, { method: 'DELETE', token }),
  saleFromQuote: (quoteId: number, token: string) =>
    request<{ sale: { id: number; quoteId: number; total: number } }>(
      '/api/sales/from-quote',
      { method: 'POST', body: { quoteId }, token },
    ),
  sales: (token: string, filters: SaleFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.estadoPago) params.set('estadoPago', filters.estadoPago);
    if (filters.estadoVenta) params.set('estadoVenta', filters.estadoVenta);
    if (filters.branchId) params.set('branchId', String(filters.branchId));
    if (filters.search) params.set('search', filters.search);
    const qs = params.toString();
    return request<{ sales: Sale[] }>(`/api/sales${qs ? `?${qs}` : ''}`, { token });
  },
  anularSale: (id: number, token: string) =>
    request<{ ok: boolean; estado: SaleEstado }>(`/api/sales/${id}/anular`, {
      method: 'POST',
      token,
    }),
  deleteSale: (id: number, token: string) =>
    request<{ ok: boolean }>(`/api/sales/${id}`, { method: 'DELETE', token }),
  duplicateSale: (id: number, token: string) =>
    request<{ sale: { id: number; total: number; estadoPago: SaleEstadoPago } }>(
      `/api/sales/${id}/duplicate`,
      { method: 'POST', token },
    ),
  saleDetail: (id: number, token: string) =>
    request<{ sale: SaleDetail }>(`/api/sales/${id}`, { token }),
  nextSaleNumber: (token: string) => request<{ nextNumber: number }>('/api/sales/next-number', { token }),
  updateSale: (id: number, input: SaleUpdateInput, token: string) =>
    request<{ ok: boolean; estadoPago?: SaleEstadoPago; metodoPago?: SaleMetodoPago; sellerName?: string }>(
      `/api/sales/${id}`,
      { method: 'PATCH', body: input, token },
    ),
  uploadSaleReceipt: (saleId: number, input: { base64: string; ext: string }, token: string) =>
    request<{ url: string }>(`/api/sales/${saleId}/receipt`, {
      method: 'POST',
      body: input,
      token,
    }),
  addSalePayment: (saleId: number, input: { monto: number; nota?: string | null }, token: string) =>
    request<{
      payment: SalePayment;
      totalPagado: number;
      estadoPago: SaleEstadoPago;
      saldo: number;
    }>(`/api/sales/${saleId}/payments`, { method: 'POST', body: input, token }),
  deleteSalePayment: (saleId: number, paymentId: number, token: string) =>
    request<{ ok: boolean; totalPagado: number; estadoPago: SaleEstadoPago; saldo: number }>(
      `/api/sales/${saleId}/payments/${paymentId}`,
      { method: 'DELETE', token },
    ),
  deliverSale: (saleId: number, token: string) =>
    request<{ ok: boolean; entregadaAt: string | null }>(`/api/sales/${saleId}/deliver`, {
      method: 'POST',
      token,
    }),
  createSale: (
    input: {
      clientId?: number | null;
      branchId?: number | null;
      agentId?: number | null;
      metodoPago?: SaleMetodoPago;
      notaPago?: string | null;
      transferenciaNumero?: string | null;
      pagoInicial?: number;
      items: QuoteItemInput[];
    },
    token: string,
  ) =>
    request<{ sale: { id: number; total: number; estadoPago: SaleEstadoPago; metodoPago: SaleMetodoPago } }>(
      '/api/sales',
      { method: 'POST', body: input, token },
    ),
  addSaleItem: (saleId: number, input: QuoteItemInput, token: string) =>
    request<{ item: { id: number; subtotal: number }; total: number }>(
      `/api/sales/${saleId}/items`,
      { method: 'POST', body: input, token },
    ),
  updateSaleItem: (
    saleId: number,
    itemId: number,
    input: Partial<Pick<QuoteItemInput, 'description' | 'quantity' | 'unit' | 'unitPrice'>>,
    token: string,
  ) =>
    request<{ item: { id: number; subtotal: number }; total: number }>(
      `/api/sales/${saleId}/items/${itemId}`,
      { method: 'PATCH', body: input, token },
    ),
  deleteSaleItem: (saleId: number, itemId: number, token: string) =>
    request<{ ok: boolean; total: number }>(`/api/sales/${saleId}/items/${itemId}`, {
      method: 'DELETE',
      token,
    }),
  clients: (token: string) => request<{ clients: Client[] }>('/api/clients', { token }),
  createClient: (
    input: { name: string; phone?: string | null; email?: string | null },
    token: string,
  ) => request<{ client: Client }>('/api/clients', { method: 'POST', body: input, token }),
  products: (token: string, search?: string) =>
    request<{ products: Product[] }>(
      `/api/products${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      { token },
    ),
  createProduct: (
    input: {
      name: string;
      price: number;
      unit: string;
      stock?: number;
      codigoInterno?: string | null;
      marca?: string | null;
      procedencia?: string | null;
    },
    token: string,
  ) => request<{ product: Product }>('/api/products', { method: 'POST', body: input, token }),
  deleteProduct: (id: number, token: string) =>
    request<unknown>(`/api/products/${id}`, { method: 'DELETE', token }),
  createQuote: (
    input: { clientId: number | null; branchId: number | null; items: QuoteItemInput[]; notes?: string | null },
    token: string,
  ) =>
    request<{ quote: { id: number; total: number } }>('/api/quotes', {
      method: 'POST',
      body: input,
      token,
    }),
  nextQuoteNumber: (token: string) =>
    request<{ nextNumber: number }>('/api/quotes/next-number', { token }),
  business: (token: string) =>
    request<{ business: Business | null }>('/api/business', { token }),
  updateBusiness: (input: BusinessUpdateInput, token: string) =>
    request<{ business: Business }>('/api/business', { method: 'PUT', body: input, token }),
  uploadBusinessAsset: (
    input: { tipo: 'logo' | 'sello'; base64: string; ext: string },
    token: string,
  ) =>
    request<{ url: string }>('/api/business/assets', { method: 'POST', body: input, token }),
  branches: (token: string) =>
    request<{ branches: Branch[] }>('/api/branches', { token }),
  createBranch: (name: string, token: string) =>
    request<{ branch: Branch }>('/api/branches', { method: 'POST', body: { name }, token }),
  updateBranch: (id: number, input: { name: string }, token: string) =>
    request<{ branch: { id: number; name: string } }>(`/api/branches/${id}`, {
      method: 'PATCH',
      body: input,
      token,
    }),
  deleteBranch: (id: number, token: string) =>
    request<{ ok: boolean }>(`/api/branches/${id}`, { method: 'DELETE', token }),
  agents: (token: string) => request<{ agents: Agent[] }>('/api/agents', { token }),
  createAgent: (input: { name: string }, token: string) =>
    request<{ agent: Agent }>('/api/agents', { method: 'POST', body: input, token }),
  updateAgent: (id: number, input: { name: string }, token: string) =>
    request<{ agent: Agent }>(`/api/agents/${id}`, { method: 'PATCH', body: input, token }),
  deleteAgent: (id: number, token: string) =>
    request<{ ok: boolean }>(`/api/agents/${id}`, { method: 'DELETE', token }),
  quoteDetail: (id: number, token: string) =>
    request<{ quote: QuoteDetail }>(`/api/quotes/${id}`, { token }),
  updateQuote: (id: number, input: QuoteUpdateInput, token: string) =>
    request<{ ok: boolean }>(`/api/quotes/${id}`, { method: 'PATCH', body: input, token }),
  addQuoteItem: (quoteId: number, input: QuoteItemInput, token: string) =>
    request<{ item: { id: number; subtotal: number }; total: number }>(
      `/api/quotes/${quoteId}/items`,
      { method: 'POST', body: input, token },
    ),
  updateQuoteItem: (
    quoteId: number,
    itemId: number,
    input: Partial<Pick<QuoteItemInput, 'description' | 'quantity' | 'unit' | 'unitPrice'>>,
    token: string,
  ) =>
    request<{ item: { id: number; subtotal: number }; total: number }>(
      `/api/quotes/${quoteId}/items/${itemId}`,
      { method: 'PATCH', body: input, token },
    ),
  deleteQuoteItem: (quoteId: number, itemId: number, token: string) =>
    request<{ ok: boolean; total: number }>(`/api/quotes/${quoteId}/items/${itemId}`, {
      method: 'DELETE',
      token,
    }),
};
