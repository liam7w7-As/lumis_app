import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { hashPassword, verifyPassword } from '../lib/password';
import { signToken } from '../lib/jwt';
import { conflict, unauthorized } from '../middlewares/errorHandler';
import { AuthRequest, requireAuth } from '../middlewares/requireAuth';

const usernameRule = z
  .string()
  .trim()
  .min(3, 'El usuario debe tener al menos 3 caracteres')
  .max(60)
  .regex(/^[a-zA-Z0-9._-]+$/, 'El usuario solo admite letras, números y . _ -')
  .transform((u) => u.toLowerCase());

const registerSchema = z.object({
  username: usernameRule,
  name: z.string().trim().min(2, 'El nombre es muy corto'),
  email: z.string().trim().email('Email inválido').optional(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

const loginSchema = z.object({
  username: z.string().trim().min(1, 'El usuario es obligatorio'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  username: string;
  email: string | null;
  password_hash: string;
}

function publicUser(row: Pick<UserRow, 'id' | 'name' | 'username' | 'email'>) {
  return { id: row.id, name: row.name, username: row.username, email: row.email };
}

export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const { username, name, email, password } = registerSchema.parse(req.body);
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM users WHERE username = ?',
      [username],
    );
    if (existing.length > 0) {
      throw conflict('Ese usuario ya está registrado');
    }
    const passwordHash = await hashPassword(password);
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO users (username, name, email, password_hash) VALUES (?, ?, ?, ?)',
      [username, name, email ?? null, passwordHash],
    );
    const user = { id: result.insertId, name, username, email: email ?? null };
    res.status(201).json({ user, token: signToken(user.id) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, name, username, email, password_hash FROM users WHERE username = ?',
      [username.toLowerCase()],
    );
    const row = rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw unauthorized('Usuario o contraseña incorrectos');
    }
    const user = publicUser(row);
    res.json({ user, token: signToken(user.id) });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, name, username, email FROM users WHERE id = ?',
      [req.userId],
    );
    const row = rows[0];
    if (!row) {
      throw unauthorized('Usuario no encontrado');
    }
    res.json({ user: publicUser(row) });
  } catch (err) {
    next(err);
  }
});
