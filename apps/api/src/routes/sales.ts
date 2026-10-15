import { Router } from 'express';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db/pool';
import { badRequest, conflict, notFound } from '../middlewares/errorHandler';
import { AuthRequest, requireAuth } from '../middlewares/requireAuth';

export const salesRouter = Router();

export type SaleEstadoPago = 'por_cobrar' | 'pagado';
export type SaleMetodoPago = 'efectivo' | 'qr' | 'transferencia' | 'por_pagar';
export type SaleEstado = 'activa' | 'anulada';

interface SaleRow extends RowDataPacket {
  id: number;
  client_id: number | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  branch_id: number | null;
  branch_name: string | null;
  total: string;
  estado_pago: SaleEstadoPago;
  metodo_pago: SaleMetodoPago;
  estado: SaleEstado;
  anulado_at: Date | null;
  entregada_at: Date | null;
  include_sello: number;
  created_at: Date;
  seller_name: string;
  agent_id: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw notFound('Venta no encontrada');
  }
  return id;
}

async function rollbackQuiet(conn: PoolConnection): Promise<void> {
  try {
    await conn.rollback();
  } catch {
    // Sin transacción activa: nada que revertir.
  }
}

async function recalcTotal(conn: PoolConnection, saleId: number): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT COALESCE(SUM(subtotal), 0) AS total FROM sale_items WHERE sale_id = ?',
    [saleId],
  );
  const total = round2(Number(rows[0]?.total ?? 0));
  await conn.query('UPDATE sales SET total = ? WHERE id = ?', [total, saleId]);
  return total;
}

/** Recalcula estado de pago de una venta "por pagar" a partir de sus abonos. */
async function recalcPaid(
  conn: PoolConnection,
  saleId: number,
  total: number,
): Promise<{ totalPagado: number; estadoPago: SaleEstadoPago; saldo: number }> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT COALESCE(SUM(monto), 0) AS pagado FROM sale_payments WHERE sale_id = ?',
    [saleId],
  );
  const totalPagado = round2(Number(rows[0]?.pagado ?? 0));
  const estadoPago: SaleEstadoPago = totalPagado + 0.005 >= total ? 'pagado' : 'por_cobrar';
  await conn.query(
    `UPDATE sales
     SET estado_pago = ?,
         paid_at = CASE WHEN ? = 'pagado' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE NULL END
     WHERE id = ?`,
    [estadoPago, estadoPago, saleId],
  );
  return { totalPagado, estadoPago, saldo: Math.max(round2(total - totalPagado), 0) };
}

const itemInputSchema = z.object({
  productId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, 'La descripción es obligatoria').max(255),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unit: z.string().trim().min(1).max(20).default('Unidad'),
  unitPrice: z.number().min(0, 'El precio no puede ser negativo'),
  codigoInterno: z.string().trim().max(50).nullable().optional(),
  marca: z.string().trim().max(100).nullable().optional(),
  procedencia: z.string().trim().max(100).nullable().optional(),
});

const createSaleSchema = z.object({
  clientId: z.number().int().positive().nullable().optional(),
  branchId: z.number().int().positive().nullable().optional(),
  agentId: z.number().int().positive().nullable().optional(),
  metodoPago: z.enum(['efectivo', 'qr', 'transferencia', 'por_pagar']).optional(),
  notaPago: z.string().trim().max(500).nullable().optional(),
  transferenciaNumero: z.string().trim().max(50).nullable().optional(),
  pagoInicial: z.number().positive('El pago inicial debe ser mayor a 0').optional(),
  items: z.array(itemInputSchema).min(1, 'Agrega al menos un artículo').max(200),
});

/** Completa codigo/marca/procedencia desde el catálogo cuando el item trae productId. */
async function fillFromCatalog(
  conn: PoolConnection,
  productId: number,
): Promise<{ codigo: string | null; marca: string | null; procedencia: string | null }> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT codigo_interno, marca, procedencia FROM products WHERE id = ?',
    [productId],
  );
  if (rows.length === 0) {
    throw badRequest(`Producto #${productId} no encontrado`);
  }
  return {
    codigo: (rows[0].codigo_interno as string | null) ?? null,
    marca: (rows[0].marca as string | null) ?? null,
    procedencia: (rows[0].procedencia as string | null) ?? null,
  };
}

async function requireClient(conn: PoolConnection, clientId: number | null): Promise<void> {
  if (clientId === null) return;
  const [rows] = await conn.query<RowDataPacket[]>('SELECT id FROM clients WHERE id = ?', [clientId]);
  if (rows.length === 0) {
    throw notFound('Cliente no encontrado');
  }
}

async function requireBranch(conn: PoolConnection, branchId: number | null): Promise<void> {
  if (branchId === null) return;
  const [rows] = await conn.query<RowDataPacket[]>('SELECT id FROM branches WHERE id = ?', [branchId]);
  if (rows.length === 0) {
    throw notFound('Sucursal no encontrada');
  }
}

/** Valida que el agente sea del usuario y devuelve su nombre (null si no hay). */
async function requireAgent(
  conn: PoolConnection,
  userId: number | undefined,
  agentId: number | null,
): Promise<string | null> {
  if (agentId === null || userId === undefined) return null;
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT name FROM agents WHERE id = ? AND user_id = ?',
    [agentId, userId],
  );
  if (rows.length === 0) {
    throw notFound('Agente de venta no encontrado');
  }
  return rows[0].name as string;
}

async function insertItem(
  conn: PoolConnection,
  saleId: number,
  item: z.infer<typeof itemInputSchema>,
): Promise<{ id: number; subtotal: number }> {
  let codigoInterno = item.codigoInterno ?? null;
  let marca = item.marca ?? null;
  let procedencia = item.procedencia ?? null;
  if (item.productId != null) {
    const snap = await fillFromCatalog(conn, item.productId);
    codigoInterno = snap.codigo ?? codigoInterno;
    marca = snap.marca ?? marca;
    procedencia = snap.procedencia ?? procedencia;
  }
  const subtotal = round2(item.quantity * item.unitPrice);
  const [ins] = await conn.query<ResultSetHeader>(
    `INSERT INTO sale_items (sale_id, product_id, description, quantity, unit, unit_price, subtotal,
       codigo_interno, marca, procedencia)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      saleId,
      item.productId ?? null,
      item.description,
      item.quantity,
      item.unit,
      item.unitPrice,
      subtotal,
      codigoInterno,
      marca,
      procedencia,
    ],
  );
  return { id: ins.insertId, subtotal };
}

// Un filtro inválido se ignora en lugar de tumbar la respuesta.
const listSalesSchema = z.object({
  estadoPago: z
    .enum(['por_cobrar', 'pagado'])
    .optional()
    .catch(undefined),
  estadoVenta: z
    .enum(['activa', 'anulada'])
    .optional()
    .catch(undefined),
  branchId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .catch(undefined),
  search: z
    .string()
    .trim()
    .max(120)
    .optional()
    .catch(undefined),
});

const toIso = (value: Date | null): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : String(value);

salesRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const filters = listSalesSchema.parse(req.query);
    const search = filters.search ? `%${filters.search}%` : null;
    // El punto de venta opera sobre ventas activas; las anuladas solo se piden
    // explícitamente con ?estadoVenta=anulada.
    const estado = filters.estadoVenta ?? 'activa';

    // Se listan las ventas de todos los vendedores (igual que GET /api/quotes),
    // porque el historial del punto de venta muestra el equipo completo.
    const [rows] = await pool.query<SaleRow[]>(
      `SELECT s.id, s.client_id, c.name AS client_name,
              s.branch_id, b.name AS branch_name,
              s.total, s.estado_pago, s.metodo_pago, s.estado, s.anulado_at, s.entregada_at,
              s.created_at, COALESCE(s.seller_name, u.name) AS seller_name
       FROM sales s
       LEFT JOIN clients c ON c.id = s.client_id
       LEFT JOIN branches b ON b.id = s.branch_id
       JOIN users u ON u.id = s.user_id
       WHERE s.estado = ?
         AND (? IS NULL OR s.estado_pago = ?)
         AND (? IS NULL OR s.branch_id = ?)
         AND (? IS NULL OR c.name LIKE ? OR CAST(s.id AS CHAR) LIKE ?)
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 200`,
      [
        estado,
        filters.estadoPago ?? null,
        filters.estadoPago ?? null,
        filters.branchId ?? null,
        filters.branchId ?? null,
        search,
        search,
        search,
      ],
    );

    res.json({
      sales: rows.map((r) => ({
        id: r.id,
        clientId: r.client_id,
        clientName: r.client_name,
        branchId: r.branch_id,
        branchName: r.branch_name,
        total: Number(r.total),
        estadoPago: r.estado_pago,
        metodoPago: r.metodo_pago,
        estado: r.estado,
        anuladoAt: toIso(r.anulado_at),
        entregadaAt: toIso(r.entregada_at),
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        sellerName: r.seller_name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/next-number', requireAuth, async (_req: AuthRequest, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT MAX(id) AS maxId FROM sales');
    const maxId = (rows[0]?.maxId as number | null) ?? 0;
    res.json({ nextNumber: maxId + 1 });
  } catch (err) {
    next(err);
  }
});

salesRouter.get('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const [sRows] = await pool.query<SaleRow[]>(
      `SELECT s.id, s.client_id, c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
              s.branch_id, b.name AS branch_name,
              s.total, s.estado_pago, s.metodo_pago, s.estado, s.anulado_at,
              s.comprobante_url, s.nota_pago, s.transferencia_numero,
              s.entregada_at, s.include_sello, s.agent_id,
              s.created_at, COALESCE(s.seller_name, u.name) AS seller_name
       FROM sales s
       LEFT JOIN clients c ON c.id = s.client_id
       LEFT JOIN branches b ON b.id = s.branch_id
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
      [id],
    );
    const s = sRows[0];
    if (!s) {
      throw notFound('Venta no encontrada');
    }
    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT id, product_id, description, quantity, unit, unit_price, subtotal,
              codigo_interno, marca, procedencia
       FROM sale_items WHERE sale_id = ? ORDER BY id`,
      [id],
    );
    const [payments] = await pool.query<RowDataPacket[]>(
      'SELECT id, monto, nota, created_at FROM sale_payments WHERE sale_id = ? ORDER BY id',
      [id],
    );
    const paymentsOut = payments.map((p) => ({
      id: p.id as number,
      monto: Number(p.monto),
      nota: (p.nota as string | null) ?? null,
      createdAt:
        p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
    }));
    res.json({
      sale: {
        id: s.id,
        clientId: s.client_id,
        client:
          s.client_id == null
            ? null
            : {
                id: s.client_id,
                name: s.client_name,
                phone: s.client_phone ?? null,
                email: s.client_email ?? null,
              },
        branchId: s.branch_id,
        branchName: s.branch_name,
        total: Number(s.total),
        estadoPago: s.estado_pago,
        metodoPago: s.metodo_pago,
        estado: s.estado,
        anuladoAt: toIso(s.anulado_at),
        entregadaAt: toIso(s.entregada_at),
        includeSello: s.include_sello === 1,
        comprobanteUrl: (s.comprobante_url as string | null) ?? null,
        notaPago: (s.nota_pago as string | null) ?? null,
        transferenciaNumero: (s.transferencia_numero as string | null) ?? null,
        totalPagado: round2(paymentsOut.reduce((sum, p) => sum + p.monto, 0)),
        payments: paymentsOut,
        createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
        sellerName: s.seller_name,
        agentId: s.agent_id ?? null,
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

salesRouter.post('/:id/anular', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE sales SET estado = 'anulada', anulado_at = CURRENT_TIMESTAMP
       WHERE id = ? AND estado = 'activa'`,
      [id],
    );
    if (result.affectedRows === 0) {
      throw conflict('La venta no existe o ya está anulada');
    }
    res.json({ ok: true, estado: 'anulada' });
  } catch (err) {
    next(err);
  }
});

salesRouter.delete('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    // Los sale_items caen por ON DELETE CASCADE de la FK.
    const [result] = await pool.query<ResultSetHeader>('DELETE FROM sales WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      throw notFound('Venta no encontrada');
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const receiptSchema = z.object({
  base64: z.string().min(16).max(16_000_000, 'La imagen es demasiado grande'),
  ext: z.enum(['jpg', 'jpeg', 'png', 'webp']),
});

// Marca la venta como entregada y habilita la nota de entrega. Re-llamar es
// idempotente: la primera entrega fija la fecha y no se pisa al re-generar.
salesRouter.post('/:id/deliver', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const [rows] = await pool.query<SaleRow[]>(
      'SELECT id, estado, entregada_at FROM sales WHERE id = ?',
      [id],
    );
    const sale = rows[0];
    if (!sale) {
      throw notFound('Venta no encontrada');
    }
    if (sale.estado !== 'activa') {
      throw conflict('La venta está anulada');
    }
    await pool.query(
      'UPDATE sales SET entregada_at = COALESCE(entregada_at, CURRENT_TIMESTAMP) WHERE id = ?',
      [id],
    );
    const [after] = await pool.query<SaleRow[]>(
      'SELECT entregada_at FROM sales WHERE id = ?',
      [id],
    );
    res.json({ ok: true, entregadaAt: toIso(after[0]?.entregada_at ?? null) });
  } catch (err) {
    next(err);
  }
});

salesRouter.post('/:id/receipt', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const { base64, ext } = receiptSchema.parse(req.body);
    const clean = base64.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(clean)) {
      throw badRequest('La imagen no es válida');
    }
    const buffer = Buffer.from(clean, 'base64');
    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
      throw badRequest('El comprobante debe pesar menos de 8 MB');
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, estado, comprobante_url FROM sales WHERE id = ?',
      [id],
    );
    const sale = rows[0];
    if (!sale) {
      throw notFound('Venta no encontrada');
    }
    if (sale.estado !== 'activa') {
      throw conflict('La venta está anulada');
    }

    const fileName = `receipt-${id}-${Date.now()}.${ext}`;
    await fs.writeFile(path.join(config.uploadsDir, fileName), buffer);
    const url = `/uploads/${fileName}`;
    await pool.query('UPDATE sales SET comprobante_url = ? WHERE id = ?', [url, id]);

    // El comprobante anterior se borra para no acumular archivos huérfanos.
    const previous = (sale.comprobante_url as string | null) ?? null;
    if (previous?.startsWith('/uploads/')) {
      await fs.rm(path.join(config.uploadsDir, path.basename(previous)), { force: true });
    }

    res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
});

const addPaymentSchema = z.object({
  monto: z.number().positive('El monto debe ser mayor a 0'),
  nota: z.string().trim().max(190).nullable().optional(),
});

salesRouter.post('/:id/payments', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const saleId = parseId(req.params.id);
    const { monto, nota } = addPaymentSchema.parse(req.body);

    await conn.beginTransaction();
    const [sRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, total, estado, metodo_pago FROM sales WHERE id = ? FOR UPDATE',
      [saleId],
    );
    const sale = sRows[0];
    if (!sale) {
      throw notFound('Venta no encontrada');
    }
    if (sale.estado !== 'activa') {
      throw conflict('La venta está anulada');
    }
    if (sale.metodo_pago !== 'por_pagar') {
      throw badRequest('Solo las ventas con método "Por pagar" admiten abonos');
    }

    const [ins] = await conn.query<ResultSetHeader>(
      'INSERT INTO sale_payments (sale_id, monto, nota) VALUES (?, ?, ?)',
      [saleId, round2(monto), nota ?? null],
    );
    const recalc = await recalcPaid(conn, saleId, Number(sale.total));

    await conn.commit();
    res.status(201).json({
      payment: {
        id: ins.insertId,
        monto: round2(monto),
        nota: nota ?? null,
        createdAt: new Date().toISOString(),
      },
      ...recalc,
    });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

salesRouter.delete('/:id/payments/:paymentId', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const saleId = parseId(req.params.id);
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      throw notFound('Pago no encontrado');
    }

    await conn.beginTransaction();
    const [sRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, total, estado FROM sales WHERE id = ? FOR UPDATE',
      [saleId],
    );
    const sale = sRows[0];
    if (!sale) {
      throw notFound('Venta no encontrada');
    }
    if (sale.estado !== 'activa') {
      throw conflict('La venta está anulada');
    }

    const [del] = await conn.query<ResultSetHeader>(
      'DELETE FROM sale_payments WHERE id = ? AND sale_id = ?',
      [paymentId, saleId],
    );
    if (del.affectedRows === 0) {
      throw notFound('Pago no encontrado');
    }
    const recalc = await recalcPaid(conn, saleId, Number(sale.total));

    await conn.commit();
    res.json({ ok: true, ...recalc });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

salesRouter.post('/:id/duplicate', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = parseId(req.params.id);
    await conn.beginTransaction();

    const [sRows] = await conn.query<RowDataPacket[]>(
      'SELECT client_id, branch_id, total, metodo_pago FROM sales WHERE id = ?',
      [id],
    );
    const source = sRows[0];
    if (!source) {
      throw notFound('Venta no encontrada');
    }
    const [items] = await conn.query<RowDataPacket[]>(
      `SELECT product_id, description, quantity, unit, unit_price, subtotal,
              codigo_interno, marca, procedencia
       FROM sale_items WHERE sale_id = ? ORDER BY id`,
      [id],
    );
    if (items.length === 0) {
      throw badRequest('La venta no tiene artículos que copiar');
    }

    // La copia nace activa y por cobrar: es una venta nueva, sin cobrar.
    const [ins] = await conn.query<ResultSetHeader>(
      `INSERT INTO sales (user_id, client_id, branch_id, total, estado_pago, metodo_pago)
       VALUES (?, ?, ?, ?, 'por_cobrar', ?)`,
      [req.userId, source.client_id, source.branch_id, source.total, source.metodo_pago],
    );
    for (const it of items) {
      await conn.query(
        `INSERT INTO sale_items (sale_id, product_id, description, quantity, unit, unit_price, subtotal,
           codigo_interno, marca, procedencia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ins.insertId, it.product_id, it.description, it.quantity, it.unit, it.unit_price, it.subtotal,
          it.codigo_interno, it.marca, it.procedencia],
      );
    }

    await conn.commit();
    res.status(201).json({
      sale: { id: ins.insertId, total: Number(source.total), estadoPago: 'por_cobrar' },
    });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

const updateSaleSchema = z.object({
  estadoPago: z.enum(['por_cobrar', 'pagado']).optional(),
  metodoPago: z.enum(['efectivo', 'qr', 'transferencia', 'por_pagar']).optional(),
  clientId: z.number().int().positive().nullable().optional(),
  branchId: z.number().int().positive().nullable().optional(),
  agentId: z.number().int().positive().nullable().optional(),
  notaPago: z.string().trim().max(500).nullable().optional(),
  transferenciaNumero: z.string().trim().max(50).nullable().optional(),
  comprobanteUrl: z.string().trim().max(255).nullable().optional(),
  includeSello: z.boolean().optional(),
});

salesRouter.patch('/:id', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const id = parseId(req.params.id);
    const {
      estadoPago,
      metodoPago,
      clientId,
      branchId,
      agentId,
      notaPago,
      transferenciaNumero,
      comprobanteUrl,
      includeSello,
    } = updateSaleSchema.parse(req.body);
    if (
      !estadoPago &&
      !metodoPago &&
      clientId === undefined &&
      branchId === undefined &&
      agentId === undefined &&
      notaPago === undefined &&
      transferenciaNumero === undefined &&
      comprobanteUrl === undefined &&
      includeSello === undefined
    ) {
      throw badRequest('No hay nada que actualizar');
    }

    // "Por pagar" es un método de pago, pero también implica que la venta sigue
    // pendiente: se mantiene la coherencia de ambos campos.
    const nextEstado = metodoPago === 'por_pagar' ? 'por_cobrar' : estadoPago;

    await conn.beginTransaction();
    if (clientId !== undefined) {
      await requireClient(conn, clientId);
    }
    if (branchId !== undefined) {
      await requireBranch(conn, branchId);
    }
    const [existing] = await conn.query<RowDataPacket[]>(
      'SELECT id, estado FROM sales WHERE id = ? FOR UPDATE',
      [id],
    );
    if (existing.length === 0) {
      throw notFound('Venta no encontrada');
    }
    if (existing[0].estado !== 'activa') {
      throw conflict('La venta está anulada');
    }

    // Si se elige agente se guarda su nombre como vendedor; con null se vuelve
    // al nombre del usuario dueño de la venta (seller_name NULL + COALESCE).
    let sellerName: string | undefined;
    let sellerNameStored: string | null = null;
    if (agentId !== undefined) {
      if (agentId === null) {
        const [uRows] = await conn.query<RowDataPacket[]>(
          'SELECT u.name FROM sales s JOIN users u ON u.id = s.user_id WHERE s.id = ?',
          [id],
        );
        sellerName = (uRows[0]?.name as string | undefined) ?? undefined;
      } else {
        sellerName = (await requireAgent(conn, req.userId, agentId)) ?? undefined;
        sellerNameStored = sellerName ?? null;
      }
    }

    await conn.query(
      `UPDATE sales
       SET estado_pago = COALESCE(?, estado_pago),
           metodo_pago = COALESCE(?, metodo_pago),
           client_id = CASE WHEN ? THEN ? ELSE client_id END,
           branch_id = CASE WHEN ? THEN ? ELSE branch_id END,
           agent_id = CASE WHEN ? THEN ? ELSE agent_id END,
           seller_name = CASE WHEN ? THEN ? ELSE seller_name END,
           nota_pago = CASE WHEN ? THEN ? ELSE nota_pago END,
           transferencia_numero = CASE WHEN ? THEN ? ELSE transferencia_numero END,
           comprobante_url = CASE WHEN ? THEN ? ELSE comprobante_url END,
           include_sello = COALESCE(?, include_sello),
           paid_at = CASE
             WHEN ? = 'pagado' THEN COALESCE(paid_at, CURRENT_TIMESTAMP)
             WHEN ? = 'por_cobrar' THEN NULL
             ELSE paid_at
           END
       WHERE id = ?`,
      [
        nextEstado ?? null,
        metodoPago ?? null,
        clientId !== undefined, clientId ?? null,
        branchId !== undefined, branchId ?? null,
        agentId !== undefined, agentId ?? null,
        agentId !== undefined, sellerNameStored,
        notaPago !== undefined, notaPago ?? null,
        transferenciaNumero !== undefined, transferenciaNumero ?? null,
        comprobanteUrl !== undefined, comprobanteUrl ?? null,
        includeSello === undefined ? null : includeSello ? 1 : 0,
        nextEstado ?? null, nextEstado ?? null,
        id,
      ],
    );

    await conn.commit();
    res.json({ ok: true, estadoPago: nextEstado, metodoPago, sellerName });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

salesRouter.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      clientId = null,
      branchId = null,
      agentId = null,
      metodoPago = 'efectivo',
      items,
      notaPago = null,
      transferenciaNumero = null,
      pagoInicial,
    } = createSaleSchema.parse(req.body);

    await conn.beginTransaction();
    await requireClient(conn, clientId);
    await requireBranch(conn, branchId);
    const sellerName = await requireAgent(conn, req.userId, agentId);

    const total = round2(items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0));
    let estadoPago: SaleEstadoPago = metodoPago === 'por_pagar' ? 'por_cobrar' : 'pagado';

    const [ins] = await conn.query<ResultSetHeader>(
      `INSERT INTO sales (user_id, client_id, branch_id, agent_id, seller_name, total, estado_pago,
         metodo_pago, nota_pago, transferencia_numero, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.userId,
        clientId,
        branchId,
        agentId,
        sellerName,
        total,
        estadoPago,
        metodoPago,
        metodoPago === 'efectivo' ? notaPago : null,
        metodoPago === 'transferencia' ? transferenciaNumero : null,
        estadoPago === 'pagado' ? new Date() : null,
      ],
    );
    for (const it of items) {
      await insertItem(conn, ins.insertId, it);
    }

    // El pago inicial de una venta "por pagar" queda como primer abono del historial.
    if (metodoPago === 'por_pagar' && pagoInicial != null && pagoInicial > 0) {
      await conn.query('INSERT INTO sale_payments (sale_id, monto) VALUES (?, ?)', [
        ins.insertId,
        round2(pagoInicial),
      ]);
      estadoPago = (await recalcPaid(conn, ins.insertId, total)).estadoPago;
    }

    await conn.commit();
    res.status(201).json({ sale: { id: ins.insertId, total, estadoPago, metodoPago } });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

salesRouter.post('/:id/items', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const saleId = parseId(req.params.id);
    const item = itemInputSchema.parse(req.body);

    await conn.beginTransaction();
    const [sRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, estado FROM sales WHERE id = ? FOR UPDATE',
      [saleId],
    );
    if (sRows.length === 0) {
      throw notFound('Venta no encontrada');
    }
    if (sRows[0].estado !== 'activa') {
      throw conflict('La venta está anulada');
    }
    const created = await insertItem(conn, saleId, item);
    const total = await recalcTotal(conn, saleId);

    await conn.commit();
    res.status(201).json({ item: created, total });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

salesRouter.patch('/:id/items/:itemId', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const saleId = parseId(req.params.id);
    const itemId = parseId(req.params.itemId);
    const patch = z
      .object({
        description: z.string().trim().min(1).max(255).optional(),
        quantity: z.number().positive().optional(),
        unit: z.string().trim().min(1).max(20).optional(),
        unitPrice: z.number().min(0).optional(),
      })
      .parse(req.body);

    await conn.beginTransaction();
    const [sRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, estado FROM sales WHERE id = ? FOR UPDATE',
      [saleId],
    );
    if (sRows.length === 0) {
      throw notFound('Venta no encontrada');
    }
    if (sRows[0].estado !== 'activa') {
      throw conflict('La venta está anulada');
    }
    const [iRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, quantity, unit_price FROM sale_items WHERE id = ? AND sale_id = ?',
      [itemId, saleId],
    );
    const current = iRows[0];
    if (!current) {
      throw notFound('Artículo no encontrado');
    }
    const quantity = patch.quantity ?? Number(current.quantity);
    const unitPrice = patch.unitPrice ?? Number(current.unit_price);
    const subtotal = round2(quantity * unitPrice);

    await conn.query(
      `UPDATE sale_items
       SET description = COALESCE(?, description),
           quantity = ?,
           unit = COALESCE(?, unit),
           unit_price = ?,
           subtotal = ?
       WHERE id = ? AND sale_id = ?`,
      [patch.description ?? null, quantity, patch.unit ?? null, unitPrice, subtotal, itemId, saleId],
    );
    const total = await recalcTotal(conn, saleId);

    await conn.commit();
    res.json({ item: { id: itemId, subtotal }, total });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

salesRouter.delete('/:id/items/:itemId', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const saleId = parseId(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw notFound('Artículo no encontrado');
    }

    await conn.beginTransaction();
    const [sRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, estado FROM sales WHERE id = ? FOR UPDATE',
      [saleId],
    );
    if (sRows.length === 0) {
      throw notFound('Venta no encontrada');
    }
    if (sRows[0].estado !== 'activa') {
      throw conflict('La venta está anulada');
    }
    const [del] = await conn.query<ResultSetHeader>(
      'DELETE FROM sale_items WHERE id = ? AND sale_id = ?',
      [itemId, saleId],
    );
    if (del.affectedRows === 0) {
      throw notFound('Artículo no encontrado');
    }
    const total = await recalcTotal(conn, saleId);

    await conn.commit();
    res.json({ ok: true, total });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});

salesRouter.post('/from-quote', requireAuth, async (req: AuthRequest, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { quoteId } = z
      .object({ quoteId: z.number().int().positive() })
      .parse(req.body);

    await conn.beginTransaction();

    const [qRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, client_id, branch_id, status, total FROM quotes WHERE id = ? FOR UPDATE',
      [quoteId],
    );
    const quote = qRows[0];
    if (!quote) {
      throw notFound('Cotización no encontrada');
    }
    if (quote.status === 'convertida') {
      throw conflict('La cotización ya fue convertida en venta');
    }
    const [sRows] = await conn.query<RowDataPacket[]>(
      'SELECT id FROM sales WHERE quote_id = ?',
      [quoteId],
    );
    if (sRows.length > 0) {
      throw conflict('La cotización ya tiene una venta generada');
    }

    const [items] = await conn.query<RowDataPacket[]>(
      `SELECT product_id, description, quantity, unit, unit_price, subtotal,
              codigo_interno, marca, procedencia
       FROM quote_items WHERE quote_id = ?`,
      [quoteId],
    );
    const [sale] = await conn.query<ResultSetHeader>(
      'INSERT INTO sales (user_id, client_id, branch_id, quote_id, total) VALUES (?, ?, ?, ?, ?)',
      [req.userId, quote.client_id, quote.branch_id, quoteId, quote.total],
    );
    for (const it of items) {
      await conn.query(
        `INSERT INTO sale_items (sale_id, product_id, description, quantity, unit, unit_price, subtotal,
          codigo_interno, marca, procedencia)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sale.insertId, it.product_id, it.description, it.quantity, it.unit, it.unit_price, it.subtotal,
          it.codigo_interno, it.marca, it.procedencia],
      );
    }
    await conn.query("UPDATE quotes SET status = 'convertida' WHERE id = ?", [quoteId]);

    await conn.commit();
    res.status(201).json({
      sale: { id: sale.insertId, quoteId, total: Number(quote.total) },
    });
  } catch (err) {
    await rollbackQuiet(conn);
    next(err);
  } finally {
    conn.release();
  }
});
