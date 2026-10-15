import type { NextFunction, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { verifyToken } from '../lib/jwt';
import { pool } from '../db/pool';
import { ApiError, notFound, unauthorized } from './errorHandler';

export interface AuthRequest extends Request {
  userId?: number;
  businessId?: number;
  role?: 'admin' | 'seller';
}
export async function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  if (req.userId && req.businessId) return next();
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return next(unauthorized('Falta el token de autenticación'));
  let userId: number;
  try { userId = verifyToken(token).sub; }
  catch { return next(unauthorized('Token inválido o expirado')); }
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT business_id, role FROM users WHERE id = ?', [userId]);
    if (!rows[0]) throw unauthorized('Usuario no encontrado');
    req.userId = userId;
    req.businessId = Number(rows[0].business_id);
    req.role = rows[0].role;
    next();
  } catch (err) { next(err); }
}
export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  if (req.role !== 'admin') return next(new ApiError(403, 'Solo el administrador puede realizar esta acción'));
  next();
}
type TenantTable = 'clients' | 'products' | 'branches' | 'agents' | 'quotes' | 'sales';

/** Protege todas las operaciones por id, incluidas líneas, adjuntos y pagos.
 * Los listados además filtran business_id en su consulta SQL. */
export function scopeToBusiness(table: TenantTable) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.businessId) throw unauthorized();
      const check = async (target: TenantTable, id: unknown) => {
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return;
        const [rows] = await pool.query<RowDataPacket[]>(
          'SELECT id FROM ' + target + ' WHERE id = ? AND business_id = ?', [id, req.businessId]);
        if (!rows.length) throw notFound('Registro no encontrado en esta empresa');
      };
      const segment = req.path.split('/')[1];
      await check(table, Number(decodeURIComponent(segment)));
      const references: Record<string, TenantTable> = {
        clientId: 'clients', productId: 'products', branchId: 'branches', agentId: 'agents',
        quoteId: 'quotes', saleId: 'sales',
      };
      const checkReferences = async (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, target] of Object.entries(references)) {
          await check(target, (value as Record<string, unknown>)[key]);
        }
      };
      await checkReferences(req.body);
      if (Array.isArray(req.body?.items)) {
        for (const item of req.body.items.slice(0, 500)) await checkReferences(item);
      }
      next();
    } catch (err) { next(err); }
  };
}
