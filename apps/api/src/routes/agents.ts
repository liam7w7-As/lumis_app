import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { notFound, conflict } from '../middlewares/errorHandler';
import { AuthRequest, requireAuth, requireAdmin, scopeToBusiness } from '../middlewares/requireAuth';

const agentSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es muy corto').max(150),
});

export const agentsRouter = Router();
agentsRouter.use(requireAuth, scopeToBusiness('agents'));

agentsRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, account_id FROM agents WHERE business_id = ? ORDER BY id',
      [req.businessId],
    );
    res.json({
      agents: rows.map((r) => ({ id: r.id as number, name: r.name as string, accountId: r.account_id as number | null })),
    });
  } catch (err) {
    next(err);
  }
});

agentsRouter.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { name } = agentSchema.parse(req.body);
    const [ins] = await pool.query<ResultSetHeader>(
      'INSERT INTO agents (business_id, user_id, name) VALUES (?, ?, ?)',
      [req.businessId, req.userId, name],
    );
    res.status(201).json({ agent: { id: ins.insertId, name } });
  } catch (err) {
    next(err);
  }
});

agentsRouter.patch('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw notFound('Agente no encontrado');
    }
    const { name } = agentSchema.parse(req.body);
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE agents SET name = ? WHERE id = ? AND business_id = ?',
      [name, id, req.businessId],
    );
    if (result.affectedRows === 0) {
      throw notFound('Agente no encontrado');
    }
    await pool.query('UPDATE users u JOIN agents a ON a.account_id = u.id SET u.name = ? WHERE a.id = ? AND a.business_id = ?', [name, id, req.businessId]);
    res.json({ agent: { id, name } });
  } catch (err) {
    next(err);
  }
});

agentsRouter.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw notFound('Agente no encontrado');
    }
    const [linked] = await pool.query<RowDataPacket[]>('SELECT account_id FROM agents WHERE id = ? AND business_id = ?', [id, req.businessId]);
    if (linked[0]?.account_id) throw conflict('Este agente tiene una cuenta de acceso y no se puede eliminar desde esta lista.');
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM agents WHERE id = ? AND business_id = ?',
      [id, req.businessId],
    );
    if (result.affectedRows === 0) {
      throw notFound('Agente no encontrado');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
