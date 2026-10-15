import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new ApiError(400, message);
export const unauthorized = (message = 'No autorizado') => new ApiError(401, message);
export const notFound = (message = 'No encontrado') => new ApiError(404, message);
export const conflict = (message: string) => new ApiError(409, message);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.flatten().fieldErrors,
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return res.status(status).json({ error: 'Solicitud inválida' });
    }
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}
