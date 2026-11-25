import { createHash } from 'node:crypto';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import type { NextFunction, Response } from 'express';
import { config } from '../config';
import { pool } from '../db/pool';
import { ApiError } from './errorHandler';
import { requireAuth, type AuthRequest } from './requireAuth';

type DocumentRef = { kind: 'quotes' | 'sales'; id: number };
const writes = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const operationPattern = /^[A-Za-z0-9_-]{16,100}$/;
const versionPattern = /^[a-f0-9]{64}$/;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
function documentRef(req: AuthRequest): DocumentRef | null {
  const match = /^\/api\/(quotes|sales)\/([1-9]\d*)(?:\/|$)/.exec(req.originalUrl.split('?')[0]);
  if (match && Number.isSafeInteger(Number(match[2]))) return { kind: match[1] as DocumentRef['kind'], id: Number(match[2]) };
  if (req.method === 'POST' && req.originalUrl === '/api/sales/from-quote' && Number.isSafeInteger(req.body?.quoteId) && req.body.quoteId > 0) return { kind: 'quotes', id: req.body.quoteId };
  return null;
}
async function documentVersion(conn: Connection, ref: DocumentRef, businessId: number) {
  const [parents] = await conn.query<RowDataPacket[]>('SELECT * FROM ' + ref.kind + ' WHERE id=? AND business_id=?', [ref.id, businessId]);
  if (!parents[0]) return null;
  const sale = ref.kind === 'sales';
  const [items] = await conn.query<RowDataPacket[]>('SELECT * FROM ' + (sale ? 'sale_items' : 'quote_items') + ' WHERE ' + (sale ? 'sale_id' : 'quote_id') + '=? ORDER BY id', [ref.id]);
  const [payments] = sale ? await conn.query<RowDataPacket[]>('SELECT * FROM sale_payments WHERE sale_id=? ORDER BY id', [ref.id]) : [[]];
  return hash({ parent: parents[0], items, payments });
}
const failure = (code: string, message: string) => ({ error: message, code });
function responseDocument(req: AuthRequest, body: unknown, fallback: DocumentRef | null): DocumentRef | null {
  if (req.method !== 'POST') return fallback;
  const created = /^\/api\/(quotes|sales)(?:\/from-quote|\/[1-9]\d*\/duplicate)?\/?$/.exec(req.originalUrl.split('?')[0]);
  if (!created || !body || typeof body !== 'object') return fallback;
  const kind = created[1] as DocumentRef['kind'];
  const id = Number((body as Record<string, { id?: unknown }>)[kind === 'quotes' ? 'quote' : 'sale']?.id);
  return Number.isSafeInteger(id) && id > 0 ? { kind, id } : fallback;
}

/** Durable delivery receipts for the mobile outbox. Uncertain outcomes never expire
 * into a second write: a crash after a route commits must require reconciliation.
 * The advisory company write lock also covers old clients. It protects creations
 * before their ID is known, and catalogue deletes which can change document FKs.
 * Versioned document reads use the same lock to pair JSON with its version.
 * Locks use their own short-lived connection
 * because routes acquire independent transactional connections from the pool. */
export function offlineSync(req: AuthRequest, res: Response, next: NextFunction) {
  res.setHeader('X-Lumis-Offline-Version', '1');
  const mutation = writes.has(req.method);
  const operation = mutation ? req.get('X-Lumis-Operation-Id') : undefined;
  const baseVersion = mutation ? req.get('X-Lumis-Base-Version') : undefined;
  const ref = documentRef(req);
  const supported = /^\/api\/(?:quotes|sales|clients|products|branches|agents|business|tutorials)(?:\/|$)/.test(req.originalUrl) || /^\/api\/auth\/(preferences|users)(?:\/|$)/.test(req.originalUrl);
  if ((!mutation || !supported) && !ref) return next();
  if (operation && !operationPattern.test(operation)) return next(new ApiError(400, 'La clave de sincronización no es válida.', 'OFFLINE_OPERATION_INVALID'));
  if (baseVersion && !versionPattern.test(baseVersion)) return next(new ApiError(400, 'La versión del documento no es válida.', 'OFFLINE_VERSION_INVALID'));
  requireAuth(req, res, error => {
    if (error) return next(error);
    void prepare().catch(next);
  });

  async function prepare() {
    // Replays return before the route runs, so repeat the current administrator
    // restriction of these write-only administration endpoints here as well.
    if (mutation && /^\/api\/(business|agents|branches|auth\/users)(?:\/|$)/.test(req.originalUrl) && req.role !== 'admin') {
      throw new ApiError(403, 'Solo el administrador puede realizar esta acción');
    }
    const identity = [req.businessId!, req.userId!, operation];
    const fingerprint = hash({ method: req.method, path: req.originalUrl, body: req.body ?? null });
    let claimed = false;
    let conn: Connection | undefined;
    let lockName: string | undefined;
    let releasing: Promise<void> | undefined;
    const release = () => releasing ??= (async () => {
      if (conn) {
        try { if (lockName) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]); }
        finally { await conn.end(); }
      }
    })().catch(() => {});
    try {
      if (operation && supported) {
        try {
          await pool.query('INSERT INTO offline_operations (business_id,user_id,operation_id,request_hash) VALUES(?,?,?,?)', [...identity, fingerprint]);
          claimed = true;
        } catch (err) {
          if ((err as { code?: string }).code !== 'ER_DUP_ENTRY') throw err;
          const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM offline_operations WHERE business_id=? AND user_id=? AND operation_id=?', identity);
          const old = rows[0];
          if (!old || old.request_hash !== fingerprint) return res.status(409).json(failure('OFFLINE_OPERATION_CONFLICT', 'Esta clave de sincronización ya corresponde a otros datos. Revisa el cambio pendiente.'));
          if (old.state !== 'complete') return res.status(409).json(failure(old.state === 'uncertain' ? 'OFFLINE_OUTCOME_UNKNOWN' : 'OFFLINE_OPERATION_PENDING', 'El resultado de este envío necesita verificación. No vuelvas a crear la operación.'));
          if (old.document_version) res.setHeader('X-Lumis-Document-Version', old.document_version);
          res.setHeader('X-Lumis-Operation-Replayed', '1');
          return res.status(Number(old.response_status)).json(JSON.parse(old.response_json));
        }
      }
      if (ref || mutation && supported) {
        conn = await mysql.createConnection({ ...config.db, timezone: 'Z' });
        await conn.query("SET time_zone = '+00:00'");
        lockName = 'lumis-sync-' + hash([config.db.database, req.businessId]).slice(0, 48);
        const [locks] = await conn.query<RowDataPacket[]>('SELECT GET_LOCK(?,10) AS acquired', [lockName]);
        if (Number(locks[0].acquired) !== 1) throw new ApiError(409, 'Otro equipo está actualizando este documento. Reintenta la sincronización.', 'OFFLINE_DOCUMENT_BUSY');
        const current = ref ? await documentVersion(conn, ref, req.businessId!) : null;
        if (baseVersion && baseVersion !== current) throw new ApiError(409, 'Este documento cambió en otro equipo. Revisa las dos versiones antes de sincronizar.', 'OFFLINE_DOCUMENT_CONFLICT');
        if (current && !mutation) res.setHeader('X-Lumis-Document-Version', current);
      }
      const send = res.json.bind(res);
      let captured = false;
      res.json = body => {
        if (captured) return res;
        captured = true;
        const status = res.statusCode;
        void (async () => {
          const resultRef = responseDocument(req, body, ref);
          const version = resultRef && conn ? await documentVersion(conn, resultRef, req.businessId!) : null;
          if (version) res.setHeader('X-Lumis-Document-Version', version);
          const uncertain = status >= 500;
          const response = uncertain && claimed ? failure('OFFLINE_OUTCOME_UNKNOWN', 'No se pudo confirmar el resultado del envío. Consérvalo para verificarlo antes de reintentar.') : body;
          if (claimed) await pool.query('UPDATE offline_operations SET state=?,response_status=?,response_json=?,document_version=? WHERE business_id=? AND user_id=? AND operation_id=? AND state=\'pending\'',
            [uncertain ? 'uncertain' : 'complete', status, JSON.stringify(response), version, ...identity]);
          if (!res.destroyed) send(response);
        })().catch(() => {
          if (!res.destroyed) { res.statusCode = 503; send(failure('OFFLINE_OUTCOME_UNKNOWN', 'No se pudo confirmar el envío. Consérvalo para su verificación; no lo registres otra vez.')); }
        }).finally(() => { void release(); });
        return res;
      };
      res.once('finish', () => { void release(); });
      // Disconnecting must not unlock an in-flight write before its handler has
      // committed and saved the receipt. Reads and completed responses are safe.
      res.once('close', () => { if (!mutation) void release(); });
      next();
    } catch (err) {
      // No route ran, so this reservation can safely be removed and retried.
      try {
        if (claimed) await pool.query('DELETE FROM offline_operations WHERE business_id=? AND user_id=? AND operation_id=? AND state=\'pending\'', identity);
      } finally { await release(); }
      throw err;
    }
  }
}
