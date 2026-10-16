import { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodIssue } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new ApiError(400, message);
export const unauthorized = (message = 'No autorizado') => new ApiError(401, message);
export const notFound = (message = 'No encontrado') => new ApiError(404, message);
export const conflict = (message: string) => new ApiError(409, message);

const FIELD_NAMES: Record<string, string> = { name: 'nombre', nombre: 'nombre de la empresa', username: 'usuario', password: 'contraseña',
  email: 'correo', items: 'productos', quantity: 'cantidad', unitPrice: 'precio', price: 'precio', unit: 'unidad',
  base64: 'imagen', tipo: 'tipo de imagen', color_primario: 'color de marca', moneda: 'moneda', direccion: 'dirección' };
function validationMessage(issue: ZodIssue): string {
  if (!/^(Required|Expected|Invalid|String must|Number must|Array must|Too )/.test(issue.message)) return issue.message;
  const key = String(issue.path.at(-1) ?? '');
  const field = FIELD_NAMES[key] ?? 'dato';
  if (issue.code === 'invalid_type') return issue.received === 'undefined' ? 'Completa el campo ' + field + '.' : 'Revisa el formato del campo ' + field + '.';
  if (issue.code === 'too_small') return issue.type === 'string' ? 'El campo ' + field + ' debe tener al menos ' + issue.minimum + ' caracteres.' : 'El valor de ' + field + ' es demasiado pequeño.';
  if (issue.code === 'too_big') return issue.type === 'string' ? 'El campo ' + field + ' admite hasta ' + issue.maximum + ' caracteres.' : 'Se superó el límite permitido para ' + field + '.';
  return 'Revisa el valor del campo ' + field + '.';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'formulario';
      (details[key] ??= []).push(validationMessage(issue));
    }
    return res.status(400).json({ error: validationMessage(err.issues[0]), details, code: 'VALIDATION_ERROR' });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return res.status(status).json({ error: status === 413 ? 'El archivo o la solicitud supera el tamaño permitido.' : 'No se pudo leer la solicitud. Revisa los datos y vuelve a intentarlo.' });
    }
  }
  console.error(err);
  return res.status(500).json({ error: 'El servidor no pudo completar la operación. Inténtalo de nuevo en unos momentos.', code: 'INTERNAL_ERROR' });
}
