import { Router } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db/pool';
import { badRequest } from '../middlewares/errorHandler';
import { AuthRequest, requireAuth } from '../middlewares/requireAuth';

const businessSchema = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  color_primario: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)')
    .optional(),
  moneda: z.string().trim().min(1).max(10).optional(),
  logo_url: z.string().trim().max(255).nullable().optional(),
  sello_url: z.string().trim().max(255).nullable().optional(),
  terminos_default: z.string().trim().max(5000).nullable().optional(),
  redes_sociales: z.string().trim().max(150).nullable().optional(),
  website: z.string().trim().max(150).nullable().optional(),
  direccion: z.string().trim().max(255).nullable().optional(),
  ciudad: z.string().trim().max(150).nullable().optional(),
  nit: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email('Email inválido').nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
});

const COLUMNS =
  'id, nombre, color_primario, moneda, logo_url, sello_url, terminos_default, redes_sociales, website, direccion, ciudad, nit, email, telefono';

export const businessRouter = Router();

businessRouter.get('/', requireAuth, async (_req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${COLUMNS} FROM business WHERE id = 1`);
    res.json({ business: rows[0] ?? null });
  } catch (err) {
    next(err);
  }
});

businessRouter.put('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const patch = businessSchema.parse(req.body);
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${COLUMNS} FROM business WHERE id = 1`);
    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO business (id, nombre, color_primario, moneda, logo_url, sello_url, terminos_default,
          redes_sociales, website, direccion, ciudad, nit, email, telefono)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patch.nombre ?? 'Mi Negocio',
          patch.color_primario ?? '#5842F4',
          patch.moneda ?? 'Bs.',
          patch.logo_url ?? null,
          patch.sello_url ?? null,
          patch.terminos_default ?? null,
          patch.redes_sociales ?? null,
          patch.website ?? null,
          patch.direccion ?? null,
          patch.ciudad ?? null,
          patch.nit ?? null,
          patch.email ?? null,
          patch.telefono ?? null,
        ],
      );
    } else {
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          sets.push(`${key} = ?`);
          params.push(value);
        }
      }
      if (sets.length > 0) {
        await pool.query(`UPDATE business SET ${sets.join(', ')} WHERE id = 1`, params);
      }
    }
    const [updated] = await pool.query<RowDataPacket[]>(`SELECT ${COLUMNS} FROM business WHERE id = 1`);
    res.json({ business: updated[0] });
  } catch (err) {
    next(err);
  }
});

const assetSchema = z.object({
  tipo: z.enum(['logo', 'sello']),
  base64: z.string().min(16).max(16_000_000, 'La imagen es demasiado grande'),
  ext: z.enum(['jpg', 'jpeg', 'png', 'webp']),
});

// Sube logo o sello en base64 y actualiza la fila del negocio. El archivo
// anterior se borra para no acumular huérfanos en uploads/.
businessRouter.post('/assets', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { tipo, base64, ext } = assetSchema.parse(req.body);
    const clean = base64.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(clean)) {
      throw badRequest('La imagen no es válida');
    }
    const buffer = Buffer.from(clean, 'base64');
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
      throw badRequest('La imagen debe pesar menos de 8 MB');
    }

    const column = tipo === 'logo' ? 'logo_url' : 'sello_url';
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${column} FROM business WHERE id = 1`,
    );

    const fileName = `business-${tipo}-${Date.now()}.${ext}`;
    await fs.writeFile(path.join(config.uploadsDir, fileName), buffer);
    const url = `/uploads/${fileName}`;

    if (rows.length === 0) {
      await pool.query(`INSERT INTO business (id, ${column}) VALUES (1, ?)`, [url]);
    } else {
      await pool.query(`UPDATE business SET ${column} = ? WHERE id = 1`, [url]);
    }

    const previous = (rows[0]?.[column] as string | null) ?? null;
    if (previous?.startsWith('/uploads/')) {
      await fs.rm(path.join(config.uploadsDir, path.basename(previous)), { force: true });
    }

    res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
});
