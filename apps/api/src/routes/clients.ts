import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthRequest, requireAuth, scopeToBusiness } from '../middlewares/requireAuth';

const emptyToNull = (v: string | null | undefined) =>
  v && v.trim().length > 0 ? v.trim() : null;

const createClientSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es muy corto').max(150),
  phone: z.string().trim().max(40).nullish().transform(emptyToNull),
  email: z.string().trim().email('Email inválido').nullish().transform(emptyToNull),
  address: z.string().trim().max(255).nullish().transform(emptyToNull),
});

const listClientsSchema = z.object({
  search: z.string().trim().max(150).default(''),
  page: z.coerce.number().int().min(1).max(1000000).optional(),
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});

// Escape LIKE wildcards with an explicit character, independently of SQL backslash mode.
const literalSearch = (value: string) => value.replace(/[!%_]/g, '!$&');

export const clientsRouter = Router();
clientsRouter.use(requireAuth, scopeToBusiness('clients'));

clientsRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { search, page, id } = listClientsSchema.parse(req.query);
    const paged = page !== undefined || !!search || id !== undefined;
    const currentPage = page ?? 1;
    const perPage = 50;
    const params: unknown[] = [req.businessId];
    let where = 'business_id = ?';
    if (id !== undefined) { where += ' AND id = ?'; params.push(id); }
    if (search) {
      where += " AND name COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!'";
      params.push('%' + literalSearch(search) + '%');
    }
    let order = 'name, id';
    const orderParams: unknown[] = [];
    if (search) {
      order = "(name COLLATE utf8mb4_unicode_ci = ?) DESC, (name COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '!') DESC, name, id";
      orderParams.push(search, literalSearch(search) + '%');
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, phone, email FROM clients WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...params, ...orderParams, paged ? perPage : 200, paged ? (currentPage - 1) * perPage : 0],
    );
    let meta: { currentPage: number; lastPage: number; total: number } | undefined;
    if (paged) {
      const [counts] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM clients WHERE ${where}`, params);
      const total = Number(counts[0]?.total ?? 0);
      meta = { currentPage, lastPage: Math.max(1, Math.ceil(total / perPage)), total };
    }
    res.json({
      clients: rows.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        phone: (r.phone as string | null) ?? null,
        email: (r.email as string | null) ?? null,
      })),
      ...(meta ? { meta } : {}),
    });
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { name, phone, email, address } = createClientSchema.parse(req.body);
    const [ins] = await pool.query<ResultSetHeader>(
      'INSERT INTO clients (business_id, user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)',
      [req.businessId, req.userId, name, phone, email, address],
    );
    res.status(201).json({ client: { id: ins.insertId, name, phone, email, address } });
  } catch (err) {
    next(err);
  }
});
