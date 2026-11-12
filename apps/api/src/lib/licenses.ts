import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import { ApiError } from '../middlewares/errorHandler';
import { PLANS, licenseState, monthKey, expiryDay, type Meter, type PlanId } from './plans';

type Database = Pool | PoolConnection;
interface LicenseRow extends RowDataPacket {
  plan: PlanId;
  status: string;
  expires_at: Date | null;
}
const fail = (message: string, code: string): never => {
  throw new ApiError(403, message, code);
};
export async function readLicense(businessId: number, db: Database = pool, lock = false) {
  const [rows] = await db.query<LicenseRow[]>(
    'SELECT plan,status,expires_at FROM business_licenses WHERE business_id = ?' +
      (lock ? ' FOR UPDATE' : ''),
    [businessId],
  );
  if (!rows[0])
    throw new ApiError(
      503,
      'No se encontró la licencia de la empresa. Contacta con soporte.',
      'LICENSE_UNAVAILABLE',
    );
  return rows[0];
}
export async function licenseSnapshot(businessId: number, userId?: number) {
  const row = await readLicense(businessId);
  const plan = PLANS[row.plan];
  const state = licenseState(row.plan, row.status, row.expires_at);
  const [usage] = await pool.query<RowDataPacket[]>(
    'SELECT meter,period_key,used FROM license_usage WHERE business_id = ?',
    [businessId],
  );
  const [users] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE business_id = ? AND enabled = 1 ORDER BY (role = 'admin') DESC,id",
    [businessId],
  );
  const hasSeat =
    userId === undefined ||
    plan.users === null ||
    users.slice(0, plan.users).some((u) => Number(u.id) === userId);
  const quotas = Object.fromEntries(
    (['quotes', 'sales', 'deliveries', 'scans'] as Meter[]).map((meter) => {
      const period = meter === 'scans' && row.plan !== 'free' ? monthKey() : 'lifetime';
      const used = Number(
        usage.find((u) => u.meter === meter && u.period_key === period)?.used ?? 0,
      );
      const limit = plan.limits[meter];
      return [
        meter,
        { used, limit, remaining: limit === null ? null : Math.max(0, limit - used), period },
      ];
    }),
  );
  return {
    plan: row.plan,
    planName: plan.name,
    state,
    expiresAt: row.expires_at,
    expiresOn: expiryDay(row.expires_at),
    readOnly: state !== 'active' || !hasSeat,
    hasSeat,
    users: { enabled: users.length, limit: plan.users },
    quotas,
    features: { editDocuments: plan.editDocuments, brandColors: plan.brandColors },
    supportUrl: process.env.LUMIS_SUPPORT_URL || null,
    scannerAvailable: false,
  };
}
export async function assertWritable(
  businessId: number,
  userId: number,
  db: Database = pool,
  lock = false,
) {
  const row = await readLicense(businessId, db, lock);
  const state = licenseState(row.plan, row.status, row.expires_at);
  if (state === 'expired')
    fail(
      'Tu licencia venció. Puedes consultar y exportar tus documentos. Renueva para seguir trabajando.',
      'LICENSE_EXPIRED',
    );
  if (state === 'suspended')
    fail(
      'El acceso de escritura de esta empresa está suspendido. Contacta con soporte.',
      'LICENSE_SUSPENDED',
    );
  const cap = PLANS[row.plan].users;
  if (cap !== null) {
    const [users] = await db.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE business_id = ? AND enabled = 1 ORDER BY (role = 'admin') DESC,id LIMIT ?",
      [businessId, cap],
    );
    if (!users.some((u) => Number(u.id) === userId))
      fail(
        'Tu usuario no tiene un cupo disponible en este plan. Conservas consulta y exportación.',
        'USER_LIMIT_REACHED',
      );
  }
  return row;
}
// Se llama dentro de la MISMA transacción que crea el documento. Borrar no devuelve cupo.
export async function consumeUsage(
  conn: PoolConnection,
  businessId: number,
  userId: number,
  meter: Meter,
) {
  const row = await assertWritable(businessId, userId, conn, true);
  const period = meter === 'scans' && row.plan !== 'free' ? monthKey() : 'lifetime';
  const limit = PLANS[row.plan].limits[meter];
  await conn.query(
    'INSERT IGNORE INTO license_usage(business_id,meter,period_key,used) VALUES (?,?,?,0)',
    [businessId, meter, period],
  );
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT used FROM license_usage WHERE business_id=? AND meter=? AND period_key=? FOR UPDATE',
    [businessId, meter, period],
  );
  if (limit !== null && Number(rows[0].used) >= limit)
    fail(
      'Alcanzaste el cupo de tu plan. Cambia de plan para crear más documentos.',
      'PLAN_LIMIT_REACHED',
    );
  await conn.query(
    'UPDATE license_usage SET used=used+1 WHERE business_id=? AND meter=? AND period_key=?',
    [businessId, meter, period],
  );
}
export async function assertUserCapacity(conn: PoolConnection, businessId: number) {
  const row = await readLicense(businessId, conn, true);
  const cap = PLANS[row.plan].users;
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS total FROM users WHERE business_id=? AND enabled=1',
    [businessId],
  );
  if (cap !== null && Number(rows[0].total) >= cap)
    fail('Tu plan ya alcanzó el máximo de usuarios habilitados.', 'USER_LIMIT_REACHED');
}
