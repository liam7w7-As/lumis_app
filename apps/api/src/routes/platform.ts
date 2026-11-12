import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { ApiError, badRequest, notFound, unauthorized } from '../middlewares/errorHandler';
import { verifyPassword, hashPassword } from '../lib/password';
import { PLANS, expiryFromDay, expiryDay, licenseState } from '../lib/plans';
import { assertUserCapacity, licenseSnapshot, readLicense } from '../lib/licenses';
import {
  newSession,
  protectPlatformOrigin,
  readSession,
  requirePlatformAdmin,
  sessionCookie,
  sessionHash,
  type PlatformRequest,
} from '../lib/platformAuth';

export const platformRouter = Router();
platformRouter.use(protectPlatformOrigin);
platformRouter.post('/login', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { username, password } = z
      .object({
        username: z
          .string()
          .trim()
          .min(1)
          .max(60)
          .transform((s) => s.toLowerCase()),
        password: z.string().min(1).max(72),
      })
      .parse(req.body);
    await conn.beginTransaction();
    await conn.query(
      'INSERT IGNORE INTO platform_login_attempts(username,window_started) VALUES (?,UTC_TIMESTAMP())',
      [username],
    );
    const [attempts] = await conn.query<RowDataPacket[]>(
      'SELECT attempts,window_started>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) AS recent FROM platform_login_attempts WHERE username=? FOR UPDATE',
      [username],
    );
    if (attempts[0].recent && Number(attempts[0].attempts) >= 10)
      throw new ApiError(429, 'Demasiados intentos. Intenta de nuevo en 15 minutos.');
    await conn.query(
      `UPDATE platform_login_attempts SET attempts=IF(window_started>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),attempts+1,1),
      window_started=IF(window_started>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),window_started,UTC_TIMESTAMP()) WHERE username=?`,
      [username],
    );
    await conn.commit();
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT id,username,name,password_hash,enabled FROM platform_admins WHERE username=?',
      [username],
    );
    const row = rows[0];
    // Comparación bcrypt también cuando el usuario no existe.
    const valid = await verifyPassword(
      password,
      row?.password_hash || '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.',
    );
    if (!row || !valid || !row.enabled) throw unauthorized('Usuario o contraseña incorrectos');
    const token = newSession();
    await conn.query('DELETE FROM platform_sessions WHERE expires_at<=UTC_TIMESTAMP()');
    await conn.query(
      'DELETE FROM platform_login_attempts WHERE window_started<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) OR username=?',
      [username],
    );
    await conn.query(
      'INSERT INTO platform_sessions(token_hash,admin_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))',
      [sessionHash(token), row.id],
    );
    sessionCookie(res, token);
    res.json({ admin: { id: Number(row.id), username: row.username, name: row.name } });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});
platformRouter.use(requirePlatformAdmin);
platformRouter.get('/me', (req: PlatformRequest, res) => res.json({ admin: req.platformAdmin }));
platformRouter.post('/logout', async (req, res, next) => {
  try {
    const token = readSession(req);
    if (token)
      await pool.query('DELETE FROM platform_sessions WHERE token_hash=?', [sessionHash(token)]);
    sessionCookie(res, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
platformRouter.post('/password', async (req: PlatformRequest, res, next) => {
  try {
    const body = z
      .object({
        currentPassword: z.string().min(1).max(72),
        password: z
          .string()
          .min(12)
          .max(72)
          .refine(
            (value) => Buffer.byteLength(value, 'utf8') <= 72,
            'La contraseña admite hasta 72 bytes en UTF-8',
          ),
      })
      .parse(req.body);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT password_hash FROM platform_admins WHERE id=?',
      [req.platformAdmin!.id],
    );
    if (!(await verifyPassword(body.currentPassword, rows[0].password_hash)))
      throw badRequest('La contraseña actual es incorrecta');
    await pool.query('UPDATE platform_admins SET password_hash=? WHERE id=?', [
      await hashPassword(body.password),
      req.platformAdmin!.id,
    ]);
    await pool.query('DELETE FROM platform_sessions WHERE admin_id=?', [req.platformAdmin!.id]);
    sessionCookie(res, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
platformRouter.get('/plans', (_req, res) =>
  res.json({ plans: Object.values(PLANS), scannerAvailable: false }),
);
const stateSql =
  "CASE WHEN l.status='suspended' THEN 'suspended' WHEN l.plan<>'free' AND (l.expires_at IS NULL OR l.expires_at<=UTC_TIMESTAMP()) THEN 'expired' ELSE 'active' END";
platformRouter.get('/overview', async (_req, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS companies,
      SUM(l.plan='free' AND l.status='active') AS freeCompanies,
      SUM(l.plan<>'free' AND l.status='active' AND l.expires_at>UTC_TIMESTAMP()) AS paidCompanies,
      SUM(l.plan<>'free' AND l.status='active' AND l.expires_at>UTC_TIMESTAMP() AND l.expires_at<=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY)) AS expiring,
      SUM((${stateSql})<>'active') AS readOnlyCompanies,
      SUM(CASE WHEN l.status='active' AND l.expires_at>UTC_TIMESTAMP() THEN CASE l.plan WHEN 'pro' THEN 95 WHEN 'plus' THEN 170 ELSE 0 END ELSE 0 END) AS monthlyLicenseValue
      FROM business_licenses l`);
    res.json({
      overview: Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v ?? 0)])),
    });
  } catch (err) {
    next(err);
  }
});
platformRouter.get('/businesses', async (req, res, next) => {
  try {
    const query = z
      .object({
        search: z.string().trim().max(120).default(''),
        plan: z.enum(['free', 'pro', 'plus']).optional(),
        state: z.enum(['active', 'expired', 'suspended']).optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    const where = ['1=1'],
      args: unknown[] = [];
    if (query.search) {
      where.push(
        '(b.nombre LIKE ? OR EXISTS (SELECT 1 FROM users u WHERE u.business_id=b.id AND (u.username LIKE ? OR u.email LIKE ?)))',
      );
      args.push(...Array(3).fill('%' + query.search + '%'));
    }
    if (query.plan) {
      where.push('l.plan=?');
      args.push(query.plan);
    }
    if (query.state) {
      where.push(`(${stateSql})=?`);
      args.push(query.state);
    }
    const from =
      ' FROM business b JOIN business_licenses l ON l.business_id=b.id WHERE ' +
      where.join(' AND ');
    const [total] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total' + from, args);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT b.id,b.nombre AS name,b.email,b.telefono AS phone,l.plan,l.status,l.expires_at,
      (SELECT COUNT(*) FROM users u WHERE u.business_id=b.id AND u.enabled=1) AS enabledUsers,
      (SELECT u.name FROM users u WHERE u.business_id=b.id ORDER BY (u.role='admin') DESC,u.id LIMIT 1) AS ownerName` +
        from +
        ' ORDER BY b.id DESC LIMIT 20 OFFSET ?',
      [...args, (query.page - 1) * 20],
    );
    res.json({
      businesses: rows.map((r) => ({
        ...r,
        state: licenseState(r.plan, r.status, r.expires_at),
        expiresOn: expiryDay(r.expires_at),
      })),
      total: Number(total[0].total),
      page: query.page,
    });
  } catch (err) {
    next(err);
  }
});
const idOf = (raw: string) => z.coerce.number().int().positive().parse(raw);
platformRouter.get('/businesses/:id', async (req, res, next) => {
  try {
    const id = idOf(req.params.id);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id,nombre AS name,email,telefono AS phone,ciudad AS city FROM business WHERE id=?',
      [id],
    );
    if (!rows[0]) throw notFound('Empresa no encontrada');
    const [users] = await pool.query<RowDataPacket[]>(
      "SELECT id,name,username,email,role,enabled FROM users WHERE business_id=? ORDER BY (role='admin') DESC,id",
      [id],
    );
    const license = await licenseSnapshot(id);
    const cap = license.users.limit;
    const seats = users
      .filter((u) => u.enabled)
      .slice(0, cap ?? users.length)
      .map((u) => u.id);
    res.json({
      business: rows[0],
      license,
      users: users.map((u) => ({ ...u, enabled: !!u.enabled, hasSeat: seats.includes(u.id) })),
    });
  } catch (err) {
    next(err);
  }
});
platformRouter.put('/businesses/:id/license', async (req: PlatformRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = idOf(req.params.id);
    const body = z
      .object({
        plan: z.enum(['free', 'pro', 'plus']),
        status: z.enum(['active', 'suspended']),
        expiresOn: z.string().nullable(),
        note: z.string().trim().min(3, 'Escribe el motivo del cambio').max(500),
      })
      .strict()
      .parse(req.body);
    let expiry: Date | null = null;
    if (body.plan !== 'free') {
      try {
        expiry = expiryFromDay(body.expiresOn || '');
      } catch {
        throw badRequest('Indica una fecha de vencimiento válida');
      }
    }
    await conn.beginTransaction();
    const before = await readLicense(id, conn, true);
    await conn.query(
      'UPDATE business_licenses SET plan=?,status=?,expires_at=? WHERE business_id=?',
      [body.plan, body.status, expiry, id],
    );
    await conn.query(
      'INSERT INTO license_events(business_id,admin_id,action,detail) VALUES (?,?,?,?)',
      [
        id,
        req.platformAdmin!.id,
        'license_updated',
        JSON.stringify({
          before: {
            plan: before.plan,
            status: before.status,
            expiresOn: expiryDay(before.expires_at),
          },
          after: {
            plan: body.plan,
            status: body.status,
            expiresOn: body.plan === 'free' ? null : body.expiresOn,
          },
          note: body.note,
        }),
      ],
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});
platformRouter.patch('/businesses/:id/users/:userId', async (req: PlatformRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = idOf(req.params.id),
      userId = idOf(req.params.userId);
    const { enabled } = z.object({ enabled: z.boolean() }).strict().parse(req.body);
    await conn.beginTransaction();
    await readLicense(id, conn, true);
    const [users] = await conn.query<RowDataPacket[]>(
      'SELECT id,role,enabled FROM users WHERE business_id=? ORDER BY id FOR UPDATE',
      [id],
    );
    const user = users.find((u) => Number(u.id) === userId);
    if (!user) throw notFound('Usuario no encontrado en esta empresa');
    if (
      !enabled &&
      user.role === 'admin' &&
      !users.some((u) => u.id !== userId && u.role === 'admin' && u.enabled)
    )
      throw badRequest('Conserva al menos un administrador habilitado en la empresa');
    if (enabled && !user.enabled) await assertUserCapacity(conn, id);
    await conn.query('UPDATE users SET enabled=? WHERE id=?', [enabled ? 1 : 0, userId]);
    await conn.query(
      'INSERT INTO license_events(business_id,admin_id,action,detail) VALUES (?,?,?,?)',
      [id, req.platformAdmin!.id, 'user_access_updated', JSON.stringify({ userId, enabled })],
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});
platformRouter.get('/activity', async (req, res, next) => {
  try {
    const { businessId, page } = z
      .object({
        businessId: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    const where = businessId ? ' WHERE e.business_id=?' : '',
      args = businessId ? [businessId] : [];
    const [count] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM license_events e' + where,
      args,
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id,e.business_id AS businessId,b.nombre AS businessName,a.name AS actor,e.action,e.detail,e.created_at AS createdAt
      FROM license_events e JOIN business b ON b.id=e.business_id JOIN platform_admins a ON a.id=e.admin_id` +
        where +
        ' ORDER BY e.id DESC LIMIT 25 OFFSET ?',
      [...args, (page - 1) * 25],
    );
    res.json({
      events: rows.map((r) => ({
        ...r,
        detail: typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail,
      })),
      total: Number(count[0].total),
      page,
    });
  } catch (err) {
    next(err);
  }
});
platformRouter.use((_req, res) => res.status(404).json({ error: 'Ruta del panel no encontrada' }));
