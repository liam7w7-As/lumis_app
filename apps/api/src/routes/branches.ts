import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { notFound } from '../middlewares/errorHandler';
import { AuthRequest, requireAuth } from '../middlewares/requireAuth';

const createBranchSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es muy corto').max(150),
  address: z.string().trim().max(255).nullable().optional(),
});

const updateBranchSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es muy corto').max(150),
});

export const branchesRouter = Router();

branchesRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, address FROM branches WHERE user_id = ? ORDER BY id',
      [req.userId],
    );
    res.json({
      branches: rows.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        address: (r.address as string | null) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

branchesRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { name, address } = createBranchSchema.parse(req.body);
    const [ins] = await pool.query<ResultSetHeader>(
      'INSERT INTO branches (user_id, name, address) VALUES (?, ?, ?)',
      [req.userId, name, address ?? null],
    );
    res.status(201).json({ branch: { id: ins.insertId, name, address: address ?? null } });
  } catch (err) {
    next(err);
  }
});

branchesRouter.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw notFound('Sucursal no encontrada');
    }
    const { name } = updateBranchSchema.parse(req.body);
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE branches SET name = ? WHERE id = ? AND user_id = ?',
      [name, id, req.userId],
    );
    if (result.affectedRows === 0) {
      throw notFound('Sucursal no encontrada');
    }
    res.json({ branch: { id, name } });
  } catch (err) {
    next(err);
  }
});

branchesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw notFound('Sucursal no encontrada');
    }
    // Las ventas y cotizaciones que la usaban quedan con branch_id NULL
    // (FK ON DELETE SET NULL), así que el borrado es seguro.
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM branches WHERE id = ? AND user_id = ?',
      [id, req.userId],
    );
    if (result.affectedRows === 0) {
      throw notFound('Sucursal no encontrada');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
