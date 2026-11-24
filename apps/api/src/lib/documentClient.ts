import { z } from 'zod';

export const documentClientSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre del cliente').max(150),
  phone: z.string().trim().max(40).nullable(),
  email: z.string().trim().email().max(190).nullable(),
  address: z.string().trim().max(255).nullable(),
  nit: z.string().trim().max(40).nullable(),
}).strict();

export function readClientDetails(value: unknown): Record<string, string | null> {
  if (typeof value === 'string') return JSON.parse(value);
  return (value ?? {}) as Record<string, string | null>;
}

export function documentClient(row: Record<string, unknown>, nameOverride?: unknown) {
  const saved = readClientDetails(row.client_details);
  return {
    name: (nameOverride ?? saved.name ?? row.client_name ?? '') as string,
    phone: Object.hasOwn(saved, 'phone') ? saved.phone : (row.client_phone ?? null),
    email: Object.hasOwn(saved, 'email') ? saved.email : (row.client_email ?? null),
    address: Object.hasOwn(saved, 'address') ? saved.address : (row.client_address ?? null),
    nit: saved.nit ?? null,
  };
}
