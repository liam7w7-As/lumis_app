import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { notFound } from '../middlewares/errorHandler';
import { AuthRequest, requireAuth } from '../middlewares/requireAuth';

const agentSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es muy corto').max(150),
});

export const agentsRouter = Router();

agentsRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name FROM agents WHERE user_id = ? ORDER BY id',
      [req.userId],
    );
    res.json({
      agents: rows.map((r) => ({ id: r.id as number, name: r.name as string })),
    });
  } catch (err) {
    next(err);
  }
});

agentsRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { name } = agentSchema.parse(req.body);
    const [ins] = await pool.query<ResultSetHeader>(
      'INSERT INTO agents (user_id, name) VALUES (?, ?)',
      [req.userId, name],
    );
    res.status(201).json({ agent: { id: ins.insertId, name } });
  } catch (err) {
    next(err);
  }
});

agentsRouter.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw notFound('Agente no encontrado');
    }
    const { name } = agentSchema.parse(req.body);
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE agents SET name = ? WHERE id = ? AND user_id = ?',
      [name, id, req.userId],
    );
    if (result.affectedRows === 0) {
      throw notFound('Agente no encontrado');
    }
    res.json({ agent: { id, name } });
  } catch (err) {
    next(err);
  }
});

agentsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw notFound('Agente no encontrado');
    }
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM agents WHERE id = ? AND user_id = ?',
      [id, req.userId],
    );
    if (result.affectedRows === 0) {
      throw notFound('Agente no encontrado');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
