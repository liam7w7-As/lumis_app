export type PlanId = 'free' | 'pro' | 'plus';
export type State = 'active' | 'expired' | 'suspended';
export interface Admin {
  id: number;
  name: string;
  username: string;
}
export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  users: number | null;
  editDocuments: boolean;
  brandColors: boolean;
  limits: Record<string, number | null>;
  scansPeriod: string;
}
export interface License {
  plan: PlanId;
  planName: string;
  state: State;
  expiresOn: string | null;
  readOnly: boolean;
  users: { enabled: number; limit: number | null };
  quotas: Record<
    string,
    { used: number; limit: number | null; remaining: number | null; period: string }
  >;
  scannerAvailable: boolean;
}
export interface Business {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  plan: PlanId;
  state: State;
  expiresOn: string | null;
  enabledUsers: number;
  ownerName: string;
}
export interface BusinessUser {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: 'admin' | 'seller';
  enabled: boolean;
  hasSeat: boolean;
}
export interface BusinessDetail {
  business: Business & { city: string | null };
  license: License;
  users: BusinessUser[];
}
export interface Overview {
  companies: number;
  freeCompanies: number;
  paidCompanies: number;
  expiring: number;
  readOnlyCompanies: number;
  monthlyLicenseValue: number;
}
export interface AuditEvent {
  id: number;
  businessId: number;
  businessName: string;
  actor: string;
  action: string;
  detail: {
    note?: string;
    after?: { plan: PlanId; status: string; expiresOn: string | null };
    userId?: number;
    enabled?: boolean;
  };
  createdAt: string;
}
export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch('/api/platform' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !['/login', '/me'].includes(path))
      window.dispatchEvent(new Event('lumis-admin-expired'));
    throw new RequestError(
      response.status,
      data?.error || 'No se pudo conectar con Lumis. Intenta de nuevo.',
    );
  }
  return data as T;
}
