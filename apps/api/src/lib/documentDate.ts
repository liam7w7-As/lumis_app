import { z } from 'zod';

// No aceptar fechas que las columnas TIMESTAMP de MySQL no puedan representar.
export const documentDateSchema = z.string().datetime({ offset: true, message: 'Selecciona una fecha válida.' })
  .refine((value) => {
    const timestamp = Date.parse(value);
    return timestamp >= Date.parse('1970-01-02T00:00:00Z') && timestamp < Date.parse('2038-01-18T00:00:00Z');
  }, 'La fecha está fuera del rango admitido.');
