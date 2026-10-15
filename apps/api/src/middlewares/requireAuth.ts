import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/jwt';
import { unauthorized } from './errorHandler';

export interface AuthRequest extends Request {
  userId?: number;
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    return next(unauthorized('Falta el token de autenticación'));
  }
  try {
    req.userId = verifyToken(token).sub;
    next();
  } catch {
    next(unauthorized('Token inválido o expirado'));
  }
}
