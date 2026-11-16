import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { ApiError } from '../middlewares/errorHandler';
import { requireAuth, type AuthRequest } from '../middlewares/requireAuth';
import { decodeImage } from '../lib/imageUpload';
import { assertWritable, consumeUsage } from '../lib/licenses';
import { monthKey, PLANS } from '../lib/plans';
import { rankScanProducts, type ScanProduct } from '../lib/quoteScanMatching';
import { readQuoteImage, scannedListSchema, scannerAvailable, type QuoteImageReader, type ScannedLine } from '../lib/quoteVision';

const inputSchema = z.object({ scanId: z.string().uuid(), base64: z.string().min(1).max(12 * 1024 * 1024) });
const pending = () => new ApiError(409, 'La lectura sigue en curso. Espera unos momentos y vuelve a intentar con la misma imagen.', 'SCAN_PENDING');
const reused = () => new ApiError(409, 'Esta lectura corresponde a otra imagen. Selecciona la foto de nuevo.', 'SCAN_ID_REUSED');
interface ScanRow extends RowDataPacket {
  image_hash: string; status: 'pending' | 'complete' | 'failed'; result_json: string | null;
  lease_token: string; lease_fresh: number;
  attempts: number; attempt_fresh: number;
}

async function candidates(line: ScannedLine, businessId: number): Promise<ScanProduct[]> {
  const terms = [...new Set(line.name.split(/\s+/).filter(word => word.length > 1)
    .sort((a, b) => b.length - a.length).slice(0, 3))];
  const parts = ['TRIM(name) = ?', 'codigo_interno = ?'];
  const values: unknown[] = [businessId, line.name, line.codigoInterno ?? line.name];
  for (const term of terms) { parts.push('name LIKE ?'); values.push('%' + term.replace(/[\\%_]/g, '\\$&') + '%'); }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id,name,description,price,stock,unit,codigo_interno,marca,procedencia FROM products
     WHERE business_id = ? AND (${parts.join(' OR ')})
     ORDER BY (TRIM(name) = ?) DESC, (codigo_interno = ?) DESC, name LIMIT 80`,
    [...values, line.name, line.codigoInterno ?? line.name],
  );
  return rows.map(row => ({ id: Number(row.id), name: String(row.name), description: row.description ?? null,
    price: Number(row.price), stock: Number(row.stock), unit: String(row.unit),
    codigoInterno: row.codigo_interno ?? null, marca: row.marca ?? null, procedencia: row.procedencia ?? null }));
}
async function rollback(conn: PoolConnection) { await conn.rollback().catch(() => {}); }

export function createQuoteScanRouter(reader: QuoteImageReader = readQuoteImage) {
  const router = Router();
  router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
    let lease: string | null = null;
    let scanId = '';
    let conn: PoolConnection | undefined;
    try {
      const input = inputSchema.parse(req.body);
      scanId = input.scanId;
      const image = decodeImage(input.base64);
      const hash = createHash('sha256').update(image.buffer).digest('hex');
      const businessId = req.businessId!, userId = req.userId!;
      conn = await pool.getConnection();
      await conn.beginTransaction();
      const license = await assertWritable(businessId, userId, conn, true);
      const [previous] = await conn.query<ScanRow[]>(
        `SELECT image_hash,status,result_json,lease_token,attempts,
          (started_at > DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE)) AS attempt_fresh,
          (started_at > DATE_SUB(UTC_TIMESTAMP(),INTERVAL 120 SECOND)) AS lease_fresh
         FROM quote_scans WHERE business_id=? AND user_id=? AND scan_id=? FOR UPDATE`, [businessId, userId, scanId]);
      const old = previous[0];
      if (old?.image_hash !== undefined && old.image_hash !== hash) throw reused();
      if (old?.status === 'complete' && old.result_json) {
        await conn.commit();
        res.json(JSON.parse(old.result_json));
        return;
      }
      if (old?.status === 'pending' && old.lease_fresh) throw pending();
      if (old?.attempt_fresh && old.attempts >= 3)
        throw new ApiError(429, 'Espera un minuto antes de volver a leer esta imagen.', 'SCAN_RATE_LIMITED');
      if (!scannerAvailable()) throw new ApiError(503, 'El escaneo mágico aún no está configurado. Contacta con soporte.', 'SCANNER_UNAVAILABLE');
      const period = license.plan === 'free' ? 'lifetime' : monthKey();
      const [usage] = await conn.query<RowDataPacket[]>(
        "SELECT used FROM license_usage WHERE business_id=? AND meter='scans' AND period_key=?", [businessId, period]);
      const [reservations] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM quote_scans WHERE business_id=? AND status='pending' AND period_key=?
          AND started_at > DATE_SUB(UTC_TIMESTAMP(),INTERVAL 120 SECOND)`, [businessId, period]);
      const reserved = Number(reservations[0].total);
      if (Number(usage[0]?.used ?? 0) + reserved >= PLANS[license.plan].limits.scans)
        throw reserved > 0 ? pending() : new ApiError(403, 'Alcanzaste el cupo de escaneos de tu plan.', 'PLAN_LIMIT_REACHED');
      if (reserved >= 2) throw pending();
      const [recent] = await conn.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM quote_scans WHERE business_id=? AND created_at > DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE)', [businessId]);
      if (!old && Number(recent[0].total) >= 20)
        throw new ApiError(429, 'Realizaste varias lecturas seguidas. Espera un minuto antes de continuar.', 'SCAN_RATE_LIMITED');
      lease = randomUUID();
      await conn.query(
        `INSERT INTO quote_scans(business_id,user_id,scan_id,image_hash,status,lease_token,period_key,started_at,attempts)
          VALUES(?,?,?,?,'pending',?,?,UTC_TIMESTAMP(),?)
         ON DUPLICATE KEY UPDATE status='pending',lease_token=VALUES(lease_token),period_key=VALUES(period_key),
          started_at=UTC_TIMESTAMP(),attempts=VALUES(attempts),result_json=NULL`,
        [businessId, userId, scanId, hash, lease, period, old?.attempt_fresh ? Number(old.attempts) + 1 : 1]);
      await conn.commit();
      conn.release();
      conn = undefined;

      // El proveedor externo nunca mantiene abierta una transacción SQL.
      const extracted = scannedListSchema.safeParse({ items: await reader(image) });
      if (!extracted.success) throw new ApiError(422, 'No se pudo identificar una lista clara de hasta 100 productos.', 'SCAN_UNREADABLE');
      const lines = extracted.data.items;
      const resolved = [];
      for (const line of lines) resolved.push(rankScanProducts(line, await candidates(line, businessId)));
      const result = { scan: { id: scanId, lines: resolved } };

      conn = await pool.getConnection();
      await conn.beginTransaction();
      await assertWritable(businessId, userId, conn, true);
      const [current] = await conn.query<ScanRow[]>(
        'SELECT lease_token,status FROM quote_scans WHERE business_id=? AND user_id=? AND scan_id=? FOR UPDATE', [businessId, userId, scanId]);
      if (current[0]?.lease_token !== lease || current[0]?.status !== 'pending') throw pending();
      await consumeUsage(conn, businessId, userId, 'scans');
      await conn.query("UPDATE quote_scans SET status='complete',result_json=? WHERE business_id=? AND user_id=? AND scan_id=? AND lease_token=?",
        [JSON.stringify(result), businessId, userId, scanId, lease]);
      await conn.commit();
      res.json(result);
    } catch (err) {
      if (conn) { await rollback(conn); conn.release(); conn = undefined; }
      if (lease) await pool.query(
        "UPDATE quote_scans SET status='failed',result_json=NULL WHERE business_id=? AND user_id=? AND scan_id=? AND lease_token=? AND status='pending'",
        [req.businessId, req.userId, scanId, lease]).catch(() => {});
      next(err);
    } finally { conn?.release(); }
  });
  return router;
}
