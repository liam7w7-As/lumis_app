import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { type AuthRequest, requireAuth } from '../middlewares/requireAuth';

const guideKey = z.enum(['dashboard', 'quotes', 'quote-create', 'quote-detail', 'sales',
  'sale-editor', 'sale-detail', 'settings', 'clients', 'products', 'pdf']);
const progressSchema = z.object({
  version: z.literal(1),
  status: z.enum(['in_progress', 'completed', 'skipped']),
  stepId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/).nullable(),
}).strict();
function progress(row: RowDataPacket) {
  return { guide: row.guide_key, version: Number(row.version), status: row.status,
    stepId: row.step_id, updatedAt: new Date(row.updated_at).toISOString() };
}
export const tutorialsRouter = Router();
tutorialsRouter.use(requireAuth);
tutorialsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT guide_key, version, status, step_id, updated_at FROM user_tutorials WHERE user_id = ? AND business_id = ?',
      [req.userId, req.businessId]);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ progress: rows.map(progress) });
  } catch (error) { next(error); }
});
tutorialsRouter.put('/:guide', async (req: AuthRequest, res, next) => {
  try {
    const guide = guideKey.parse(req.params.guide);
    const input = progressSchema.parse(req.body);
    await pool.query(
      'INSERT INTO user_tutorials (user_id, business_id, guide_key, version, status, step_id) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE status = VALUES(status), step_id = VALUES(step_id), updated_at = CURRENT_TIMESTAMP(3)',
      [req.userId, req.businessId, guide, input.version, input.status, input.stepId]);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT guide_key, version, status, step_id, updated_at FROM user_tutorials WHERE user_id = ? AND business_id = ? AND guide_key = ? AND version = ?',
      [req.userId, req.businessId, guide, input.version]);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ progress: progress(rows[0]) });
  } catch (error) { next(error); }
});
