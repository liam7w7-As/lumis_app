import { API_URL, backendPath, IS_NOVALED } from './backend';
import type { PageMeta } from './pagedCollection';
import { notifySessionExpiry } from './authEvents';
import { notifyLicenseChange } from './licenseEvents';
import { runLegacyOperation, rememberLegacyBody } from './legacyOperation';
import { requestStockSelection, type StockChoiceItem } from './stockSelection';
export { API_URL } from './backend';

export function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || /^(file|content|data):/.test(path)) return path;
  return `${API_URL}${path}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface CompanyLicense {
  plan:'free'|'pro'|'plus';planName:string;state:'active'|'expired'|'suspended';expiresOn:string|null;
  readOnly:boolean;hasSeat:boolean;users:{enabled:number;limit:number|null};
  quotas:Record<'quotes'|'sales'|'deliveries'|'scans',{used:number;limit:number|null;remaining:number|null;period:string}>;
  features:{editDocuments:boolean;brandColors:boolean};supportUrl:string|null;scannerAvailable:boolean;
}
export interface TutorialProgress {
  guide: string;
  version: number;
  status: 'in_progress' | 'completed' | 'skipped';
  stepId: string | null;
  updatedAt: string;
}

export interface User {
  id: number;
  name: string;
  username: string;
  email: string | null;
  businessId: number;
  role: 'admin' | 'seller';
  themeMode: 'system' | 'light' | 'dark';
  branchId?: number;
  permissions?: { viewQuotes: boolean; createQuotes: boolean; editQuoteDates: boolean;
    viewSales: boolean; createSales: boolean; takePayments: boolean; viewStock: boolean; manualEntry: boolean };
}

export type DashboardPeriod = 'hoy' | 'semana' | 'mes';

export interface DashboardStat {
  value: number;
  previousValue: number;
  changePercent: number | null;
}

export interface DashboardStats {
  period: DashboardPeriod;
  timeZone: string;
  comparison: string;
  updatedAt: string;
  quotes: DashboardStat;
  approved: DashboardStat;
  sales: DashboardStat;
  receivable: DashboardStat;
  chart: { label: string; value: number }[];
}

export type QuoteStatus = 'borrador' | 'aprobada' | 'rechazada' | 'convertida';

export interface Quote {
  id: number;
  number?: number;
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
  accountId?: number | null;
  id: number;
  name: string;
}

export type SaleEstadoPago = 'por_cobrar' | 'pagado';
export type SaleMetodoPago = 'efectivo' | 'qr' | 'transferencia' | 'por_pagar';
export type SaleEstado = 'activa' | 'anulada';

export interface Sale {
  id: number;
  number?: number;
  canEditItems?: boolean;
  canEditDate?: boolean;
  canChangeBranch?: boolean;
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
  confirmDraft?: boolean;
  createdAt?: string;
  estadoPago?: SaleEstadoPago;
  metodoPago?: SaleMetodoPago;
  clientId?: number | null;
  branchId?: number | null;
  agentId?: number | null;
  notaPago?: string | null;
  transferenciaNumero?: string | null;
  comprobanteUrl?: null;
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
  number?: number;
  clientName?: string | null;
  canEditDate?: boolean;
  allowedStatuses?: QuoteStatus[];
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
  createdAt?: string;
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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const body = options.body && typeof options.body === 'object' ? options.body as Record<string, unknown> : {};
  const createDocument = options.method === 'POST' && ['/api/quotes', '/api/sales', '/api/sales/from-quote'].includes(path);
  const payment = (options.method === 'POST' && /^\/api\/sales\/\d+\/payments$/.test(path)) || (options.method === 'PATCH' && body.estadoPago === 'pagado');
  const keyField = createDocument ? 'solicitud_id' : 'clave_operacion';
  if (IS_NOVALED && options.token && (createDocument || payment) && !body[keyField]) {
    return runLegacyOperation(path, options.token, body, keyField, () => createDocument ? newRequestId() : newPaymentId(),
      payload => request<T>(path, { ...options, body: payload }), error => error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status));
  }
  const resolvedPath = backendPath(path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(API_URL + resolvedPath, {
      method: options.method ?? 'GET', signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const data = await res.json().catch(() => null) as { error?: string; message?: string; code?: string; stock?: StockChoiceItem[]; errors?: Record<string, string[]>; details?: Record<string, string[]> } | null;
    if (!res.ok) {
      if (IS_NOVALED && data?.code === 'STOCK_SELECTION_REQUIRED' && data.stock && options.token) {
        const selections = await requestStockSelection(data.stock);
        if (!selections) throw new ApiError(422, 'Selección cancelada. La venta no se guardó.', 'CANCELLED');
        const payload = { ...body, stock_selections: selections };
        if (body.solicitud_id) await rememberLegacyBody(path, options.token, payload);
        return request<T>(path, { ...options, body: payload });
      }
      if (res.status === 401 && options.token) notifySessionExpiry(options.token);
      if (!IS_NOVALED && /^(LICENSE_|PLAN_|USER_LIMIT)/.test(data?.code ?? '')) notifyLicenseChange();
      const errors = data?.errors ?? data?.details;
      const detail = errors ? Object.values(errors).flat().filter(Boolean)[0] : undefined;
      throw new ApiError(res.status, detail ?? data?.message ?? data?.error ?? 'El servidor no pudo completar la solicitud. Inténtalo de nuevo.', data?.code);
    }
    if (data == null) throw new ApiError(502, 'El servidor respondió de forma inesperada. Inténtalo de nuevo.', 'INVALID_RESPONSE');
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, controller.signal.aborted ? 'La solicitud tardó demasiado. Comprueba tu conexión y vuelve a intentarlo.'
      : 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.', controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
  } finally { clearTimeout(timer); }
}

function newRequestId(): string { return 'lumis-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2); }
function newPaymentId(): string { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random()*16); return (c === 'x' ? n : (n & 3) | 8).toString(16); }); }

export interface ListOptions { search?: string; page?: number; id?: number }
function collectionPath(path: string, options: ListOptions) {
  const params = new URLSearchParams();
  if (options.search) params.set('search', options.search);
  if (options.page != null) params.set('page', String(options.page));
  if (options.id != null) params.set('id', String(options.id));
  const query = params.toString();
  return path + (query ? '?' + query : '');
}

export const api = {
  license: (token:string)=>request<{license:CompanyLicense}>('/api/license',{token}),
  tutorials: (token: string) => request<{ progress: TutorialProgress[] }>('/api/tutorials', { token }),
  saveTutorial: (guide: string, input: Pick<TutorialProgress, 'version' | 'status' | 'stepId'>, token: string) =>
    request<{ progress: TutorialProgress }>('/api/tutorials/' + encodeURIComponent(guide), { method: 'PUT', body: input, token }),
  users: (token: string) => request<{ users: User[] }>('/api/auth/users', { token }),
  createUser: (input: { username: string; name: string; password: string }, token: string) =>
    request<{ user: User }>('/api/auth/users', { method: 'POST', body: input, token }),
  updatePreferences: (themeMode: 'system' | 'light' | 'dark', token: string) =>
    request<{ themeMode: string }>('/api/auth/preferences', { method: 'PATCH', body: { themeMode }, token }),
  reorderItems: (kind: 'quotes' | 'sales', id: number, itemIds: number[], token: string) =>
    request<{ ok: boolean }>('/api/' + kind + '/' + id + '/items/reorder', { method: 'POST', body: { itemIds }, token }),
  duplicateItem: (kind: 'quotes' | 'sales', id: number, itemId: number, token: string) =>
    request<{ item: { id: number }; total: number }>('/api/' + kind + '/' + id + '/items/' + itemId + '/duplicate', { method: 'POST', token }),
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
  dashboard: (token: string, period: DashboardPeriod) =>
    request<{ dashboard: DashboardStats }>(`/api/dashboard?period=${period}`, { token }),
  quotes: (token: string, options: ListOptions = {}) =>
    request<{ quotes: Quote[]; meta?: PageMeta }>(collectionPath('/api/quotes', IS_NOVALED ? options : {}), { token }),
  duplicateQuote: (id: number, token: string) =>
    request<{ quote: { id: number } }>(`/api/quotes/${id}/duplicate`, {
      method: 'POST',
      token,
    }),
  deleteQuote: (id: number, token: string) =>
    request<unknown>(`/api/quotes/${id}`, { method: 'DELETE', token }),
  saleFromQuote: (quoteId: number, token: string) =>
    request<{ sale: { id: number; number?: number; quoteId: number; total: number } }>(
      '/api/sales/from-quote',
      { method: 'POST', body: { quoteId }, token },
    ),
  sales: (token: string, filters: SaleFilters & { page?: number } = {}) => {
    const params = new URLSearchParams();
    if (filters.estadoPago) params.set('estadoPago', filters.estadoPago);
    if (filters.estadoVenta) params.set('estadoVenta', filters.estadoVenta);
    if (filters.branchId) params.set('branchId', String(filters.branchId));
    if (filters.search) params.set('search', filters.search);
    if (IS_NOVALED && filters.page != null) params.set('page', String(filters.page));
    const qs = params.toString();
    return request<{ sales: Sale[]; meta?: PageMeta }>(`/api/sales${qs ? `?${qs}` : ''}`, { token });
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
    request<{ ok: boolean; estadoPago?: SaleEstadoPago; metodoPago?: SaleMetodoPago; sellerName?: string; createdAt?: string }>(
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
      createdAt?: string;
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
    request<{ sale: { id: number; number?: number; total: number; estadoPago: SaleEstadoPago; metodoPago: SaleMetodoPago } }>(
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
  clients: (token: string, options: ListOptions = {}) =>
    request<{ clients: Client[]; meta?: PageMeta }>(collectionPath('/api/clients', IS_NOVALED ? options : {}), { token }),
  createClient: (
    input: { name: string; phone?: string | null; email?: string | null },
    token: string,
  ) => request<{ client: Client }>('/api/clients', { method: 'POST', body: input, token }),
  products: (token: string, search?: string, page?: number) =>
    request<{ products: Product[]; meta?: PageMeta }>(
      collectionPath('/api/products', { search, ...(IS_NOVALED ? { page } : {}) }),
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
    request<{ quote: { id: number; number?: number; total: number } }>('/api/quotes', {
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
    request<{ ok: boolean; createdAt?: string }>(`/api/quotes/${id}`, { method: 'PATCH', body: input, token }),
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

export function mediaSource(path: string | null, token: string | null) {
  const uri = mediaUrl(path) ?? undefined;
  return { uri, ...(uri?.startsWith(API_URL + '/') && token ? { headers: { Authorization: 'Bearer ' + token } } : {}) };
}
