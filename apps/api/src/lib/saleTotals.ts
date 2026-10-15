import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

/** Las ventas al contado conservan su estado; el crédito depende de los abonos. */
export async function reconcileCreditSale(conn: PoolConnection, id: number, total: number) {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT COALESCE(SUM(monto), 0) AS paid FROM sale_payments WHERE sale_id = ?', [id]);
  const status = Number(rows[0].paid) + 0.005 >= total ? 'pagado' : 'por_cobrar';
  await conn.query("UPDATE sales SET estado_pago = ?, paid_at = CASE WHEN ? = 'pagado' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE NULL END WHERE id = ? AND metodo_pago = 'por_pagar'", [status, status, id]);
}
