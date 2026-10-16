import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import fs from 'node:fs/promises';
import path from 'node:path';
import { saveUpload } from '../lib/uploadStorage';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db/pool';
import { decodeImage } from '../lib/imageUpload';
import { notFound } from '../middlewares/errorHandler';
import { type AuthRequest, requireAuth, requireAdmin } from '../middlewares/requireAuth';

const businessSchema = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  color_primario: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  moneda: z.string().trim().min(1).max(10).optional(),
  terminos_default: z.string().trim().max(5000).nullable().optional(),
  redes_sociales: z.string().trim().max(150).nullable().optional(),
  website: z.string().trim().max(150).nullable().optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
  ciudad: z.string().trim().max(150).nullable().optional(),
  nit: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email('Email inválido').nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
});
const COLUMNS = 'id, nombre, color_primario, moneda, logo_url, sello_url, terminos_default, redes_sociales, website, direccion, ciudad, nit, email, telefono';
export const businessRouter = Router();
businessRouter.use(requireAuth);
businessRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT ' + COLUMNS + ' FROM business WHERE id = ?', [req.businessId]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ business: rows[0] ?? null });
  } catch (err) { next(err); }
});
businessRouter.put('/', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const patch = businessSchema.parse(req.body);
    const entries = Object.entries(patch).filter(([,value]) => value !== undefined);
    if (entries.length) await pool.query('UPDATE business SET ' + entries.map(([key]) => key + ' = ?').join(', ') +
      ' WHERE id = ?', [...entries.map(([,value]) => value), req.businessId]);
    const [rows] = await pool.query<RowDataPacket[]>('SELECT ' + COLUMNS + ' FROM business WHERE id = ?', [req.businessId]);
    if (!rows[0]) throw notFound('Empresa no encontrada');
    res.json({ business: rows[0] });
  } catch (err) { next(err); }
});
businessRouter.post('/assets', requireAdmin, async (req: AuthRequest, res, next) => {
  try {
    const { tipo, base64 } = z.object({
      tipo: z.enum(['logo','sello']), base64: z.string().min(16).max(16_000_000),
    }).parse(req.body);
    const { buffer, ext } = decodeImage(base64);
    const column = tipo === 'logo' ? 'logo_url' : 'sello_url';
    const [rows] = await pool.query<RowDataPacket[]>('SELECT ' + column + ' FROM business WHERE id = ?', [req.businessId]);
    if (!rows[0]) throw notFound('Empresa no encontrada');
    const { filePath, url } = await saveUpload(buffer, ext, 'business-' + req.businessId);
    try { await pool.query('UPDATE business SET ' + column + ' = ? WHERE id = ?', [url, req.businessId]); }
    catch (err) { await fs.rm(filePath, { force: true }); throw err; }
    const previous = rows[0][column] as string | null;
    if (previous?.startsWith('/uploads/')) {
      await fs.rm(path.join(config.uploadsDir, path.basename(previous)), { force: true }).catch(() => {});
    }
    res.status(201).json({ url });
  } catch (err) { next(err); }
});
