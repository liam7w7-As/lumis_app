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

export const clientsRouter = Router();
clientsRouter.use(requireAuth, scopeToBusiness('clients'));

clientsRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, phone, email FROM clients WHERE business_id = ? ORDER BY name LIMIT 200',
      [req.businessId],
    );
    res.json({
      clients: rows.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        phone: (r.phone as string | null) ?? null,
        email: (r.email as string | null) ?? null,
      })),
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
