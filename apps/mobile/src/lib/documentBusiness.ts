import type { Business } from './api';
import type { DocBusiness } from './quoteDocument';

export function documentBusiness(business: Business | null): DocBusiness {
  return {
    nombre: business?.nombre ?? 'Mi Negocio',
    color_primario: business?.color_primario ?? '#5842F4',
    moneda: business?.moneda ?? 'Bs.',
    terminos_default: business?.terminos_default ?? null,
    redes_sociales: business?.redes_sociales ?? null,
    website: business?.website ?? null,
    direccion: business?.direccion ?? null,
    ciudad: business?.ciudad ?? null,
    nit: business?.nit ?? null,
    email: business?.email ?? null,
    telefono: business?.telefono ?? null,
  };
}
