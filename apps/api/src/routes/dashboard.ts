import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { assembleDashboard, dashboardRange, type QuoteStatsRow, type SaleStatsRow } from '../lib/dashboard';
import { type AuthRequest, requireAuth } from '../middlewares/requireAuth';

export const dashboardRouter = Router();
const querySchema = z.object({ period: z.enum(['hoy', 'semana', 'mes']).default('semana') });

dashboardRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { period } = querySchema.parse(req.query);
    const now = new Date();
    const range = dashboardRange(period, now);
    const start = range.start / 1000;
    const previousStart = range.previousStart / 1000;
    const end = now.getTime() / 1000;
    // Estadísticas limitadas a la empresa autenticada.
    // Los límites epoch evitan depender de la zona horaria del servidor MySQL.
    const [[quotes], [sales]] = await Promise.all([
      pool.query<(RowDataPacket & QuoteStatsRow)[]>(
        `SELECT created_at >= FROM_UNIXTIME(?) AS current_period,
                COUNT(*) AS total, SUM(status = 'aprobada') AS approved
         FROM quotes
         WHERE business_id = ? AND created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?)
         GROUP BY current_period`,
        [start, req.businessId, previousStart, end],
      ),
      pool.query<(RowDataPacket & SaleStatsRow)[]>(
        `SELECT created_at >= FROM_UNIXTIME(?) AS current_period,
                FLOOR((UNIX_TIMESTAMP(created_at) - ?) / ?) AS bucket,
                COUNT(*) AS total, SUM(estado_pago = 'por_cobrar') AS receivable
         FROM sales
         WHERE business_id = ? AND estado = 'activa'
           AND created_at >= FROM_UNIXTIME(?) AND created_at < FROM_UNIXTIME(?)
         GROUP BY current_period, bucket`,
        [start, start, range.bucketMs / 1000, req.businessId, previousStart, end],
      ),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ dashboard: assembleDashboard(period, now, quotes, sales) });
  } catch (err) {
    next(err);
  }
});
