import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './requireAuth';
import { assertWritable } from '../lib/licenses';
import { PLANS } from '../lib/plans';
import { ApiError } from './errorHandler';

export async function licenseAccess(req: AuthRequest, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Preferencias personales y tutoriales siguen disponibles en modo consulta.
  try {
    const path = decodeURIComponent(req.originalUrl.split('?')[0]).replace(/\/$/, '').toLowerCase();
    if (path === '/api/auth/preferences' || path.startsWith('/api/tutorials/')) return next();
    const row = await assertWritable(req.businessId!, req.userId!);
    const plan = PLANS[row.plan];
    if (
      !plan.brandColors &&
      path === '/api/business' &&
      Object.hasOwn(req.body ?? {}, 'color_primario')
    ) {
      throw new ApiError(
        403,
        'La paleta de colores está disponible en Pro y Plus.',
        'PLAN_FEATURE_REQUIRED',
      );
    }
    if (!plan.editDocuments && /^\/api\/(quotes|sales)\/\d+(\/|$)/.test(path)) {
      const exportOrOperation =
        /\/(duplicate|deliver|receipt|payments)(\/\d+)?$/.test(path) && !path.includes('/items/');
      const isPatch = req.method === 'PATCH' && /^\/api\/(quotes|sales)\/\d+$/.test(path);
      const allowedKeys = path.startsWith('/api/quotes')
        ? ['status', 'includeSeal', 'showNotes', 'includeSignature']
        : [
            'estadoPago',
            'metodoPago',
            'notaPago',
            'transferenciaNumero',
            'comprobanteUrl',
            'includeSello',
          ];
      const onlyOperation =
        isPatch &&
        Object.keys(req.body ?? {}).length > 0 &&
        Object.keys(req.body).every((k) => allowedKeys.includes(k));
      if (!exportOrOperation && !onlyOperation)
        throw new ApiError(
          403,
          'Modificar documentos guardados está disponible en Pro y Plus.',
          'PLAN_FEATURE_REQUIRED',
        );
    }
    next();
  } catch (err) {
    next(err);
  }
}
