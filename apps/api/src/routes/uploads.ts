import { Router } from 'express';
import path from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import { config } from '../config';
import { type AuthRequest, requireAuth } from '../middlewares/requireAuth';
import { notFound } from '../middlewares/errorHandler';

export const uploadsRouter = Router();
uploadsRouter.get('/:file', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const name = req.params.file;
    if (name !== path.basename(name) || name.includes('\\') || name.startsWith('.')) throw notFound();
    const url = '/uploads/' + name;
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM business WHERE id = ? AND (logo_url = ? OR sello_url = ?) ' +
      'UNION ALL SELECT id FROM sales WHERE business_id = ? AND comprobante_url = ? LIMIT 1',
      [req.businessId, url, url, req.businessId, url]);
    if (!rows.length) throw notFound();
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(name, { root: config.uploadsDir }, (err) => { if (err) next(err); });
  } catch (err) { next(err); }
});
