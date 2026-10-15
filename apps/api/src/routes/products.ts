import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { notFound } from '../middlewares/errorHandler';
import { AuthRequest, requireAuth, scopeToBusiness } from '../middlewares/requireAuth';

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(150),
  description: z.string().trim().max(500).nullish().transform((v) => (v && v.length > 0 ? v : null)),
  price: z.number().min(0, 'El precio no puede ser negativo'),
  stock: z.number().int().min(0).default(0),
  unit: z.string().trim().min(1).max(20).default('Unidad'),
  codigoInterno: z.string().trim().max(50).nullish().transform((v) => (v && v.length > 0 ? v : null)),
  marca: z.string().trim().max(100).nullish().transform((v) => (v && v.length > 0 ? v : null)),
  procedencia: z.string().trim().max(100).nullish().transform((v) => (v && v.length > 0 ? v : null)),
});

export const productsRouter = Router();
productsRouter.use(requireAuth, scopeToBusiness('products'));

productsRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const params: unknown[] = [req.businessId];
    let sql =
      'SELECT id, name, description, price, stock, unit, codigo_interno, marca, procedencia FROM products WHERE business_id = ?';
    if (search.length > 0) {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }
    sql += ' ORDER BY name LIMIT 100';
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    res.json({
      products: rows.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        description: (r.description as string | null) ?? null,
        price: Number(r.price),
        stock: Number(r.stock),
        unit: r.unit as string,
        codigoInterno: (r.codigo_interno as string | null) ?? null,
        marca: (r.marca as string | null) ?? null,
        procedencia: (r.procedencia as string | null) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

productsRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { name, description, price, stock, unit, codigoInterno, marca, procedencia } =
      createProductSchema.parse(req.body);
    const [ins] = await pool.query<ResultSetHeader>(
      `INSERT INTO products (business_id, user_id, name, description, price, stock, unit, codigo_interno, marca, procedencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.businessId, req.userId, name, description, price, stock, unit, codigoInterno, marca, procedencia],
    );
    res.status(201).json({
      product: { id: ins.insertId, name, description, price, stock, unit, codigoInterno, marca, procedencia },
    });
  } catch (err) {
    next(err);
  }
});

productsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw notFound('Producto no encontrado');
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM products WHERE id = ? AND business_id = ?',
      [id, req.businessId],
    );
    if (rows.length === 0) {
      throw notFound('Producto no encontrado');
    }
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
