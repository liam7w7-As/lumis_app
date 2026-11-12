import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import { ApiError, unauthorized } from '../middlewares/errorHandler';
import { hashPassword } from './password';

export interface PlatformRequest extends Request {
  platformAdmin?: { id: number; username: string; name: string };
}
export const adminOrigin = () =>
  process.env.ADMIN_ORIGIN || 'https://admin-lumis.novaledbolivia.com';
export const cookieName = () =>
  process.env.NODE_ENV === 'production' ? '__Host-lumis_admin' : 'lumis_admin';
export const sessionHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function readSession(req: Request) {
  const value = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName() + '='))
    ?.slice(cookieName().length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function sessionCookie(res: Response, token: string | null) {
  res.cookie(cookieName(), token ?? '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: token ? 8 * 60 * 60 * 1000 : 0,
  });
}
export function protectPlatformOrigin(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = Buffer.from(adminOrigin()),
    actual = Buffer.from(req.headers.origin || '');
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(expected, actual) ||
    !req.is('application/json')
  ) {
    return next(
      new ApiError(
        403,
        'Solicitud del panel no autorizada. Vuelve a abrir el panel.',
        'INVALID_ORIGIN',
      ),
    );
  }
  next();
}
export async function requirePlatformAdmin(
  req: PlatformRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = readSession(req);
    if (!token) throw unauthorized('Inicia sesión en el panel de Lumis');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT a.id,a.username,a.name FROM platform_sessions s JOIN platform_admins a ON a.id=s.admin_id
       WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND a.enabled=1`,
      [sessionHash(token)],
    );
    if (!rows[0]) throw unauthorized('Tu sesión del panel venció. Inicia sesión de nuevo.');
    req.platformAdmin = { id: Number(rows[0].id), username: rows[0].username, name: rows[0].name };
    next();
  } catch (err) {
    next(err);
  }
}
export const newSession = () => randomBytes(32).toString('hex');

/** Configuración inicial por hPanel, sin contraseña de fábrica ni sobreescritura. */
export async function bootstrapPlatformAdmin() {
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!username && !password) return;
  const conn = await pool.getConnection();
  let locked = false;
  try {
    const [lock] = await conn.query<RowDataPacket[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':platform-bootstrap'),10) AS acquired",
    );
    locked = lock[0]?.acquired === 1;
    if (!locked) throw new Error('No se pudo bloquear la configuración inicial del panel');
    const [rows] = await conn.query<RowDataPacket[]>('SELECT id FROM platform_admins LIMIT 1');
    if (rows.length) return;
    if (
      !username ||
      !/^[a-z0-9._-]{3,60}$/.test(username) ||
      !password ||
      password.length < 12 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      throw new Error(
        'Configura ADMIN_BOOTSTRAP_USERNAME y ADMIN_BOOTSTRAP_PASSWORD (12–72 caracteres) para el panel',
      );
    }
    await conn.query('INSERT INTO platform_admins(username,name,password_hash) VALUES (?,?,?)', [
      username,
      process.env.ADMIN_BOOTSTRAP_NAME?.trim().slice(0, 120) || 'Administrador Lumis',
      await hashPassword(password),
    ]);
    console.log('Administrador del panel creado. Retira las variables ADMIN_BOOTSTRAP de hPanel.');
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':platform-bootstrap'))");
    conn.release();
  }
}
