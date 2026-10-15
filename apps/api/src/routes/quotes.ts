import { Router } from 'express';
import { registerItemActions } from './itemActions';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { badRequest, conflict, notFound } from '../middlewares/errorHandler';
import { AuthRequest, requireAuth, scopeToBusiness } from '../middlewares/requireAuth';

interface QuoteRow extends RowDataPacket {
  id: number;
  client_id: number | null;
  client_name: string | null;
  status: 'borrador' | 'aprobada' | 'rechazada' | 'convertida';
  total: string;
  created_at: Date;
  seller_name: string;
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw notFound('Cotización no encontrada');
  }
  return id;
}

async function recalcTotal(conn: PoolConnection, quoteId: number): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT COALESCE(SUM(subtotal), 0) AS total FROM quote_items WHERE quote_id = ?',
    [quoteId],
  );
  const total = round2(Number(rows[0]?.total ?? 0));
  await conn.query('UPDATE quotes SET total = ? WHERE id = ?', [total, quoteId]);
  return total;
}

async function requireDraft(conn: PoolConnection, quoteId: number): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT status FROM quotes WHERE id = ? FOR UPDATE',
    [quoteId],
  );
  const row = rows[0];
  if (!row) {
    throw notFound('Cotización no encontrada');
  }
  if (row.status !== 'borrador') {
    throw conflict('Solo se puede editar una cotización en borrador');
  }
}

async function rollbackQuiet(conn: PoolConnection): Promise<void> {
  try {
    await conn.rollback();
  } catch {
    // Sin transacción activa: nada que revertir.
  }
}

export const quotesRouter = Router();
quotesRouter.use(requireAuth, scopeToBusiness('quotes'));
registerItemActions(quotesRouter, 'quote');

quotesRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<QuoteRow[]>(
      `SELECT q.id, q.client_id, c.name AS client_name, q.status, q.total,
              q.created_at, u.name AS seller_name
       FROM quotes q
       LEFT JOIN clients c ON c.id = q.client_id
       JOIN users u ON u.id = q.user_id
       WHERE q.business_id = ?
       ORDER BY q.created_at DESC, q.id DESC
       LIMIT 200`,
      [req.businessId],
    );
    res.json({
      quotes: rows.map((r) => ({
        id: r.id,
        clientId: r.client_id,
        clientName: r.client_name,
        status: r.status,
        total: Number(r.total),
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        sellerName: r.seller_name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const round2 = (n: number) => Math.round(n * 100) / 100;

const createQuoteSchema = z.object({
  clientId: z.number().int().positive().nullable().optional(),
  branchId: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable().optional(),
        description: z.string().trim().min(1, 'La descripción es obligatoria').max(255),
        quantity: z.number().positive('La cantidad debe ser mayor a 0'),
        unit: z.string().trim().min(1).max(20).default('Unidad'),
        unitPrice: z.number().min(0, 'El precio no puede ser negativo'),
        codigoInterno: z.string().trim().max(50).nullable().optional(),
        marca: z.string().trim().max(100).nullable().optional(),
        procedencia: z.string().trim().max(100).nullable().optional(),
      }),
    )
    .min(1, 'Agrega al menos un artículo')
    .max(200),
});

quotesRouter.get('/next-number', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT MAX(id) AS maxId FROM quotes WHERE business_id = ?', [req.businessId]);
    const maxId = (rows[0]?.maxId as number | null) ?? 0;
    res.json({ nextNumber: maxId + 1 });
  } catch (err) {
    next(err);
  }
});

quotesRouter.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const [qRows] = await pool.query<RowDataPacket[]>(
      `SELECT q.id, q.client_id, q.branch_id, q.status, q.notes, q.include_seal, q.show_notes,
              q.include_signature, q.version_numero, q.fecha_vencimiento, q.terminos,
              q.total, q.created_at,
              c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
              b.name AS branch_name,
              u.name AS seller_name
       FROM quotes q
       LEFT JOIN clients c ON c.id = q.client_id
       LEFT JOIN branches b ON b.id = q.branch_id
       JOIN users u ON u.id = q.user_id
       WHERE q.id = ?`,
      [id],
    );
    const q = qRows[0];
    if (!q) {
      throw notFound('Cotización no encontrada');
    }
    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT id, product_id, description, quantity, unit, unit_price, subtotal,
              codigo_interno, marca, procedencia
       FROM quote_items WHERE quote_id = ? ORDER BY sort_order, id`,
      [id],
    );
    res.json({
      quote: {
        id: q.id as number,
        clientId: (q.client_id as number | null) ?? null,
        client:
          q.client_id == null
            ? null
            : {
                id: q.client_id as number,
                name: q.client_name as string,
                phone: (q.client_phone as string | null) ?? null,
                email: (q.client_email as string | null) ?? null,
              },
        branchId: (q.branch_id as number | null) ?? null,
        branchName: (q.branch_name as string | null) ?? null,
        status: q.status,
        notes: (q.notes as string | null) ?? null,
        includeSeal: Number(q.include_seal) === 1,
        showNotes: Number(q.show_notes) === 1,
        includeSignature: Number(q.include_signature ?? 1) === 1,
        versionNumero: Number(q.version_numero ?? 1),
        fechaVencimiento: q.fecha_vencimiento
          ? new Date(q.fecha_vencimiento as string).toISOString().slice(0, 10)
          : null,
        terminos: (q.terminos as string | null) ?? null,
        total: Number(q.total),
        createdAt: q.created_at instanceof Date ? q.created_at.toISOString() : String(q.created_at),
        sellerName: q.seller_name as string,
        items: items.map((it) => ({
          id: it.id as number,
          productId: (it.product_id as number | null) ?? null,
          description: it.description as string,
          quantity: Number(it.quantity),
          unit: it.unit as string,
          unitPrice: Number(it.unit_price),
          subtotal: Number(it.subtotal),
          codigoInterno: (it.codigo_interno as string | null) ?? null,
          marca: (it.marca as string | null) ?? null,
          procedencia: (it.procedencia as string | null) ?? null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

quotesRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { clientId = null, branchId = null, notes = null, items } = createQuoteSchema.parse(req.body);
    await conn.beginTransaction();

    if (clientId !== null) {
      const [cRows] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM clients WHERE id = ?',
        [clientId],
      );
      if (cRows.length === 0) {
        throw notFound('Cliente no encontrado');
      }
    }
    if (branchId !== null) {
      const [bRows] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM branches WHERE id = ?',
        [branchId],
      );
      if (bRows.length === 0) {
        throw notFound('Sucursal no encontrada');
      }
    }
    const snapshots = new Map<number, { codigo: string | null; marca: string | null; procedencia: string | null }>();
    for (const it of items) {
      if (it.productId != null && !snapshots.has(it.productId)) {
        const [pRows] = await conn.query<RowDataPacket[]>(
          'SELECT codigo_interno, marca, procedencia FROM products WHERE id = ?',
          [it.productId],
        );
        if (pRows.length === 0) {
          throw badRequest(`Producto #${it.productId} no encontrado`);
        }
        snapshots.set(it.productId, {
          codigo: (pRows[0].codigo_interno as string | null) ?? null,
          marca: (pRows[0].marca as string | null) ?? null,
          procedencia: (pRows[0].procedencia as string | null) ?? null,
        });
      }
    }

    const lines = items.map((it) => {
      const snap = it.productId != null ? snapshots.get(it.productId) : undefined;
      return {
        ...it,
        codigoInterno: snap?.codigo ?? it.codigoInterno ?? null,
        marca: snap?.marca ?? it.marca ?? null,
        procedencia: snap?.procedencia ?? it.procedencia ?? null,
        subtotal: round2(it.quantity * it.unitPrice),
      };
    });
    const total = round2(lines.reduce((sum, l) => sum + l.subtotal, 0));

    const [ins] = await conn.query<ResultSetHeader>(
      `INSERT INTO quotes (business_id, user_id, client_id, branch_id, status, notes, total)
       VALUES (?, ?, ?, ?, 'borrador', ?, ?)`,
      [req.businessId, req.userId, clientId, branchId, notes, total],
    );
    for (const l of lines) {
      await conn.query(
        `INSERT INTO quote_items (quote_id, product_id, description, quantity, unit, unit_price, subtotal,
          codigo_interno, marca, procedencia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ins.insertId, l.productId ?? null, l.description, l.quantity, l.unit, l.unitPrice, l.subtotal,
          l.codigoInterno, l.marca, l.procedencia],
      );
    }

    await conn.commit();
    res.status(201).json({ quote: { id: ins.insertId, total } });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Sin transacción activa: nada que revertir.
    }
    next(err);
  } finally {
    conn.release();
  }
});

quotesRouter.post('/:id/duplicate', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = parseId(req.params.id);
    await conn.beginTransaction();

    const [qRows] = await conn.query<RowDataPacket[]>(
      'SELECT client_id, branch_id, notes, total FROM quotes WHERE id = ?',
      [id],
    );
    const quote = qRows[0];
    if (!quote) {
      throw notFound('Cotización no encontrada');
    }
    const [ins] = await conn.query<ResultSetHeader>(
      `INSERT INTO quotes (business_id, user_id, client_id, branch_id, status, notes, total)
       VALUES (?, ?, ?, ?, 'borrador', ?, ?)`,
      [req.businessId, req.userId, quote.client_id, quote.branch_id, quote.notes, quote.total],
    );
    const [items] = await conn.query<RowDataPacket[]>(
      `SELECT product_id, description, quantity, unit, unit_price, subtotal,
              codigo_interno, marca, procedencia
       FROM quote_items WHERE quote_id = ? ORDER BY sort_order, id`,
      [id],
    );
    for (const it of items) {
      await conn.query(
        `INSERT INTO quote_items (quote_id, product_id, description, quantity, unit, unit_price, subtotal,
          codigo_interno, marca, procedencia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ins.insertId, it.product_id, it.description, it.quantity, it.unit, it.unit_price, it.subtotal,
          it.codigo_interno, it.marca, it.procedencia],
      );
    }

    await conn.commit();
    res.status(201).json({ quote: { id: ins.insertId } });
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Sin transacción activa: nada que revertir.
    }
    next(err);
  } finally {
    conn.release();
  }
});

const updateQuoteSchema = z.object({
  status: z.enum(['borrador', 'aprobada', 'rechazada']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  includeSeal: z.boolean().optional(),
  showNotes: z.boolean().optional(),
  includeSignature: z.boolean().optional(),
});

quotesRouter.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const patch = updateQuoteSchema.parse(req.body);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT status FROM quotes WHERE id = ?',
      [id],
    );
    const row = rows[0];
    if (!row) {
      throw notFound('Cotización no encontrada');
    }
    if (row.status === 'convertida') {
      throw conflict('No se puede modificar una cotización convertida en venta');
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      params.push(patch.notes);
    }
    if (patch.includeSeal !== undefined) {
      sets.push('include_seal = ?');
      params.push(patch.includeSeal ? 1 : 0);
    }
    if (patch.showNotes !== undefined) {
      sets.push('show_notes = ?');
      params.push(patch.showNotes ? 1 : 0);
    }
    if (patch.includeSignature !== undefined) {
      sets.push('include_signature = ?');
      params.push(patch.includeSignature ? 1 : 0);
    }
    if (sets.length === 0) {
      throw badRequest('Nada que actualizar');
    }
    params.push(id);
    await pool.query(`UPDATE quotes SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const quoteItemSchema = z.object({
  productId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, 'La descripción es obligatoria').max(255),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unit: z.string().trim().min(1).max(20).default('Unidad'),
  unitPrice: z.number().min(0, 'El precio no puede ser negativo'),
  codigoInterno: z.string().trim().max(50).nullable().optional(),
  marca: z.string().trim().max(100).nullable().optional(),
  procedencia: z.string().trim().max(100).nullable().optional(),
});

quotesRouter.post('/:id/items', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const quoteId = parseId(req.params.id);
    const input = quoteItemSchema.parse(req.body);
    await conn.beginTransaction();
    await requireDraft(conn, quoteId);
    let snap: { codigo: string | null; marca: string | null; procedencia: string | null } | undefined;
    if (input.productId != null) {
      const [pRows] = await conn.query<RowDataPacket[]>(
        'SELECT codigo_interno, marca, procedencia FROM products WHERE id = ?',
        [input.productId],
      );
      if (pRows.length === 0) {
        throw badRequest(`Producto #${input.productId} no encontrado`);
      }
      snap = {
        codigo: (pRows[0].codigo_interno as string | null) ?? null,
        marca: (pRows[0].marca as string | null) ?? null,
        procedencia: (pRows[0].procedencia as string | null) ?? null,
      };
    }
    const subtotal = round2(input.quantity * input.unitPrice);
    const [ins] = await conn.query<ResultSetHeader>(
      `INSERT INTO quote_items (quote_id, product_id, description, quantity, unit, unit_price, subtotal,
        codigo_interno, marca, procedencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quoteId, input.productId ?? null, input.description, input.quantity, input.unit,
        input.unitPrice, subtotal,
        snap?.codigo ?? input.codigoInterno ?? null,
        snap?.marca ?? input.marca ?? null,
        snap?.procedencia ?? input.procedencia ?? null],
    );
    const total = await recalcTotal(conn, quoteId);
    await conn.commit();
    res.status(201).json({ item: { id: ins.insertId, subtotal }, total });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

const patchItemSchema = z.object({
  description: z.string().trim().min(1).max(255).optional(),
  quantity: z.number().positive('La cantidad debe ser mayor a 0').optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  unitPrice: z.number().min(0, 'El precio no puede ser negativo').optional(),
});

quotesRouter.patch('/:id/items/:itemId', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const quoteId = parseId(req.params.id);
    const itemId = parseId(req.params.itemId);
    const patch = patchItemSchema.parse(req.body);
    await conn.beginTransaction();
    await requireDraft(conn, quoteId);
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT quantity, unit_price FROM quote_items WHERE id = ? AND quote_id = ?',
      [itemId, quoteId],
    );
    const row = rows[0];
    if (!row) {
      throw notFound('Artículo no encontrado');
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.description !== undefined) {
      sets.push('description = ?');
      params.push(patch.description);
    }
    if (patch.quantity !== undefined) {
      sets.push('quantity = ?');
      params.push(patch.quantity);
    }
    if (patch.unit !== undefined) {
      sets.push('unit = ?');
      params.push(patch.unit);
    }
    if (patch.unitPrice !== undefined) {
      sets.push('unit_price = ?');
      params.push(patch.unitPrice);
    }
    if (sets.length === 0) {
      throw badRequest('Nada que actualizar');
    }
    const quantity = patch.quantity ?? Number(row.quantity);
    const unitPrice = patch.unitPrice ?? Number(row.unit_price);
    const subtotal = round2(quantity * unitPrice);
    sets.push('subtotal = ?');
    params.push(subtotal, itemId, quoteId);
    await conn.query(
      `UPDATE quote_items SET ${sets.join(', ')} WHERE id = ? AND quote_id = ?`,
      params,
    );
    const total = await recalcTotal(conn, quoteId);
    await conn.commit();
    res.json({ item: { id: itemId, subtotal }, total });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

quotesRouter.delete('/:id/items/:itemId', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const quoteId = parseId(req.params.id);
    const itemId = parseId(req.params.itemId);
    await conn.beginTransaction();
    await requireDraft(conn, quoteId);
    const [result] = await conn.query<ResultSetHeader>(
      'DELETE FROM quote_items WHERE id = ? AND quote_id = ?',
      [itemId, quoteId],
    );
    if (result.affectedRows === 0) {
      throw notFound('Artículo no encontrado');
    }
    const total = await recalcTotal(conn, quoteId);
    await conn.commit();
    res.json({ ok: true, total });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

quotesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT status FROM quotes WHERE id = ?',
      [id],
    );
    const row = rows[0];
    if (!row) {
      throw notFound('Cotización no encontrada');
    }
    if (row.status === 'convertida') {
      throw conflict('No se puede borrar una cotización convertida en venta');
    }
    await pool.query('DELETE FROM quotes WHERE id = ?', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
