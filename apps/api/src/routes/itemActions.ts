import { reconcileCreditSale } from '../lib/saleTotals';
import type { Router } from 'express';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { z } from 'zod';
import { pool } from '../db/pool';
import { type AuthRequest } from '../middlewares/requireAuth';
import { conflict, notFound } from '../middlewares/errorHandler';

const idsSchema = z.object({ itemIds: z.array(z.number().int().positive()).max(500) });
export function registerItemActions(router: Router, kind: 'quote' | 'sale') {
  const parents = kind === 'quote' ? 'quotes' : 'sales';
  const items = kind === 'quote' ? 'quote_items' : 'sale_items';
  const parentKey = kind + '_id';
  const statusKey = kind === 'quote' ? 'status' : 'estado';
  const editable = kind === 'quote' ? 'borrador' : 'activa';
  router.post('/:id/items/reorder', async (req: AuthRequest, res, next) => {
    const conn = await pool.getConnection();
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const { itemIds } = idsSchema.parse(req.body);
      await conn.beginTransaction();
      const [parent] = await conn.query<RowDataPacket[]>('SELECT ' + statusKey + ' AS state FROM ' + parents +
        ' WHERE id = ? AND business_id = ? FOR UPDATE', [id, req.businessId]);
      if (!parent[0]) throw notFound();
      if (parent[0].state !== editable) throw conflict('Este documento no admite cambios');
      const [current] = await conn.query<RowDataPacket[]>('SELECT id FROM ' + items + ' WHERE ' + parentKey + ' = ?', [id]);
      const existing = new Set(current.map((r) => Number(r.id)));
      if (itemIds.length !== existing.size || new Set(itemIds).size !== existing.size ||
          itemIds.some((itemId) => !existing.has(itemId))) {
        throw conflict('Los productos cambiaron. Actualiza el documento y vuelve a ordenarlos.');
      }
      for (const [position, itemId] of itemIds.entries()) {
        await conn.query('UPDATE ' + items + ' SET sort_order = ? WHERE id = ? AND ' + parentKey + ' = ?', [position, itemId, id]);
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (err) { await conn.rollback(); next(err); }
    finally { conn.release(); }
  });
  router.post('/:id/items/:itemId/duplicate', async (req: AuthRequest, res, next) => {
    const conn = await pool.getConnection();
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const itemId = z.coerce.number().int().positive().parse(req.params.itemId);
      await conn.beginTransaction();
      const [parent] = await conn.query<RowDataPacket[]>('SELECT ' + statusKey + ' AS state FROM ' + parents +
        ' WHERE id = ? AND business_id = ? FOR UPDATE', [id, req.businessId]);
      if (!parent[0]) throw notFound();
      if (parent[0].state !== editable) throw conflict('Este documento no admite cambios');
      const columns = 'product_id, description, quantity, unit, unit_price, subtotal, codigo_interno, marca, procedencia';
      const [result] = await conn.query<ResultSetHeader>('INSERT INTO ' + items + ' (' + parentKey + ', ' + columns +
        ') SELECT ' + parentKey + ', ' + columns + ' FROM ' + items + ' WHERE id = ? AND ' + parentKey + ' = ?', [itemId, id]);
      if (!result.affectedRows) throw notFound('Producto no encontrado');
      const [totals] = await conn.query<RowDataPacket[]>('SELECT COALESCE(SUM(subtotal), 0) AS total FROM ' + items +
        ' WHERE ' + parentKey + ' = ?', [id]);
      const total = Number(totals[0].total);
      await conn.query('UPDATE ' + parents + ' SET total = ? WHERE id = ?', [total, id]);
      if (kind === 'sale') await reconcileCreditSale(conn, id, total);
      await conn.commit();
      res.status(201).json({ item: { id: result.insertId }, total });
    } catch (err) { await conn.rollback(); next(err); }
    finally { conn.release(); }
  });
}
