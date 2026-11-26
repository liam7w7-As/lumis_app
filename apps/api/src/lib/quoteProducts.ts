import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ApiError } from '../middlewares/errorHandler';

export async function resolveQuoteProducts<T extends {
  productId?: number | null; createProduct?: boolean; fromScan?: boolean; description: string; unit: string; unitPrice: number;
  codigoInterno?: string | null; marca?: string | null; procedencia?: string | null;
}>(conn: PoolConnection, items: T[], businessId: number, userId: number): Promise<T[]> {
  const resolved: T[] = [];
  for (const item of items) {
    if (item.productId != null || !item.createProduct) { resolved.push(item); continue; }
    // A partial scanned line belongs to the quote without becoming an invalid catalogue record.
    if (item.fromScan && (!item.description.trim() || !item.unit.trim() || item.description.length > 150)) {
      resolved.push({ ...item, createProduct: false });
      continue;
    }
    if (item.description.length > 150) throw new ApiError(422, 'El nombre del producto nuevo admite hasta 150 caracteres.', 'PRODUCT_NAME_TOO_LONG');
    const [matches] = await conn.query<RowDataPacket[]>(
      'SELECT id FROM products WHERE business_id=? AND LOWER(TRIM(name))=LOWER(?) AND LOWER(TRIM(unit))=LOWER(?) LIMIT 2',
      [businessId, item.description, item.unit]);
    if (matches.length > 1) {
      if (item.fromScan) { resolved.push({ ...item, createProduct: false }); continue; }
      throw new ApiError(422, 'Hay varios productos con ese nombre y unidad. Selecciona el correcto del catálogo.', 'PRODUCT_AMBIGUOUS');
    }
    let productId = matches[0]?.id as number | undefined;
    if (!productId) {
      const [created] = await conn.query<ResultSetHeader>(
        `INSERT INTO products(business_id,user_id,name,price,stock,unit,codigo_interno,marca,procedencia)
         VALUES(?,?,?,?,0,?,?,?,?)`,
        [businessId, userId, item.description, item.unitPrice, item.unit, item.codigoInterno ?? null, item.marca ?? null, item.procedencia ?? null]);
      productId = created.insertId;
    }
    resolved.push({ ...item, productId });
  }
  return resolved;
}
