import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { hashPassword, verifyPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { conflict, unauthorized } from '../middlewares/errorHandler';
import { type AuthRequest, requireAuth, requireAdmin } from '../middlewares/requireAuth';

const usernameRule = z.string().trim().min(3).max(60)
  .regex(/^[a-zA-Z0-9._-]+$/, 'El usuario solo admite letras, números y . _ -')
  .transform((u) => u.toLowerCase());
const registerSchema = z.object({
  username: usernameRule, name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().optional(),
  password: z.string().min(8, 'Usa al menos 8 caracteres').max(72),
});
const loginSchema = z.object({
  username: z.string().trim().min(1), password: z.string().min(1),
});
const USER_COLUMNS = 'id, name, username, email, business_id, role, theme_mode';
function publicUser(row: RowDataPacket | Record<string, unknown>) {
  return { id: Number(row.id), name: row.name, username: row.username, email: row.email,
    businessId: Number(row.business_id), role: row.role, themeMode: row.theme_mode };
}
function accountError(err: unknown) {
  return (err as { code?: string })?.code === 'ER_DUP_ENTRY'
    ? conflict('Ese usuario o correo ya está registrado') : err;
}
export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { username, name, email, password } = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(password);
    await conn.beginTransaction();
    const [business] = await conn.query<ResultSetHeader>(
      'INSERT INTO business (nombre) VALUES (?)', ['Mi Negocio']);
    const [result] = await conn.query<ResultSetHeader>(
      "INSERT INTO users (username, name, email, password_hash, business_id, role) VALUES (?, ?, ?, ?, ?, 'admin')",
      [username, name, email ?? null, passwordHash, business.insertId]);
    await conn.query('INSERT INTO agents (user_id, account_id, business_id, name) VALUES (?, ?, ?, ?)',
      [result.insertId, result.insertId, business.insertId, name]);
    await conn.commit();
    const user = publicUser({ id: result.insertId, name, username, email: email ?? null,
      business_id: business.insertId, role: 'admin', theme_mode: 'system' });
    res.status(201).json({ user, token: signToken(user.id) });
  } catch (err) { await conn.rollback(); next(accountError(err)); }
  finally { conn.release(); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT ' + USER_COLUMNS + ', password_hash FROM users WHERE username = ?', [username.toLowerCase()]);
    const row = rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw unauthorized('Usuario o contraseña incorrectos');
    }
    res.json({ user: publicUser(row), token: signToken(Number(row.id)) });
  } catch (err) { next(err); }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT ' + USER_COLUMNS + ' FROM users WHERE id = ?', [req.userId]);
    if (!rows[0]) throw unauthorized('Usuario no encontrado');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ user: publicUser(rows[0]) });
  } catch (err) { next(err); }
});

authRouter.patch('/preferences', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { themeMode } = z.object({ themeMode: z.enum(['system', 'light', 'dark']) }).parse(req.body);
    await pool.query('UPDATE users SET theme_mode = ? WHERE id = ?', [themeMode, req.userId]);
    res.json({ themeMode });
  } catch (err) { next(err); }
});

authRouter.get('/users', requireAuth, requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT ' + USER_COLUMNS + ' FROM users WHERE business_id = ? ORDER BY id', [req.businessId]);
    res.json({ users: rows.map(publicUser) });
  } catch (err) { next(err); }
});

authRouter.post('/users', requireAuth, requireAdmin, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { username, name, email, password } = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(password);
    await conn.beginTransaction();
    const [result] = await conn.query<ResultSetHeader>(
      "INSERT INTO users (username, name, email, password_hash, business_id, role) VALUES (?, ?, ?, ?, ?, 'seller')",
      [username, name, email ?? null, passwordHash, req.businessId]);
    await conn.query('INSERT INTO agents (user_id, account_id, business_id, name) VALUES (?, ?, ?, ?)',
      [req.userId, result.insertId, req.businessId, name]);
    await conn.commit();
    res.status(201).json({ user: publicUser({ id: result.insertId, name, username, email: email ?? null,
      business_id: req.businessId, role: 'seller', theme_mode: 'system' }) });
  } catch (err) { await conn.rollback(); next(accountError(err)); }
  finally { conn.release(); }
});
