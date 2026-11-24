import type { DocumentClientDetails } from './api';

export function getDocumentClient(document: {
  clientName?: string | null;
  clientDetails?: DocumentClientDetails;
  client?: { name: string; phone: string | null; email: string | null; address?: string | null; nit?: string | null } | null;
}): DocumentClientDetails {
  return document.clientDetails ?? {
    name: document.clientName ?? document.client?.name ?? '',
    phone: document.client?.phone ?? null,
    email: document.client?.email ?? null,
    address: document.client?.address ?? null,
    nit: document.client?.nit ?? null,
  };
}

export function documentClientHtml(details: DocumentClientDetails): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines = [details.nit && `NIT / CI: ${details.nit}`, details.phone && `Tel: ${details.phone}`, details.email, details.address].filter(Boolean) as string[];
  return lines.map(line => `<div style="font-size:7.2pt;color:#6b7280;margin-top:1mm;overflow-wrap:anywhere">${escape(line)}</div>`).join('');
}

export function verifySavedDocumentClient(saved: DocumentClientDetails | undefined, expected: DocumentClientDetails): void {
  if (!saved || (Object.keys(expected) as (keyof DocumentClientDetails)[]).some(key => saved[key] !== expected[key])) {
    throw new Error('El servidor no confirmó los datos del cliente. Actualiza la API y vuelve a intentarlo.');
  }
}
