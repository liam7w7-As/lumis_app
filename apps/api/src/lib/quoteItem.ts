import { z } from 'zod';

const MAX_QUANTITY = 99999999.99;
const MAX_AMOUNT = 9999999999.99;
const quantity = z.number().finite().min(0, 'La cantidad no puede ser negativa').max(MAX_QUANTITY);
const unitPrice = z.number().finite().min(0, 'El precio no puede ser negativo').max(MAX_AMOUNT);

const fields = {
  productId: z.number().int().positive().nullable().optional(),
  createProduct: z.boolean().optional(),
  fromScan: z.boolean().optional(),
  description: z.string().trim().max(255),
  quantity,
  unit: z.string().trim().max(20).default('Unidad'),
  unitPrice,
  codigoInterno: z.string().trim().max(50).nullable().optional(),
  marca: z.string().trim().max(100).nullable().optional(),
  procedencia: z.string().trim().max(100).nullable().optional(),
};

function requireOrdinaryFields(item: { description?: string; quantity?: number; unit?: string }, ctx: z.RefinementCtx) {
  if (item.description !== undefined && !item.description)
    ctx.addIssue({ code: 'custom', path: ['description'], message: 'La descripción es obligatoria' });
  if (item.quantity !== undefined && item.quantity <= 0)
    ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'La cantidad debe ser mayor a 0' });
  if (item.unit !== undefined && !item.unit)
    ctx.addIssue({ code: 'custom', path: ['unit'], message: 'La unidad es obligatoria' });
}

export const quoteItemSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const item = value as Record<string, unknown>;
  if (item.fromScan !== true) return value;
  return { ...item, description: item.description ?? '', unit: item.unit ?? '',
    quantity: item.quantity == null || item.quantity === '' ? 0 : item.quantity,
    unitPrice: item.unitPrice == null || item.unitPrice === '' ? 0 : item.unitPrice };
}, z.object(fields).superRefine((item, ctx) => {
  if (!item.fromScan) requireOrdinaryFields(item, ctx);
  if (Math.round(item.quantity * item.unitPrice * 100) / 100 > MAX_AMOUNT)
    ctx.addIssue({ code: 'custom', path: ['unitPrice'], message: 'El subtotal supera el máximo permitido' });
}));

/** The stored origin controls sparse edits; clients cannot turn a normal line into a scanned line. */
export function quoteItemPatchSchema(fromScan: boolean) {
  return z.object({ description: fields.description.optional(), quantity: quantity.optional(),
    unit: z.string().trim().max(20).optional(), unitPrice: unitPrice.optional(),
    marca: fields.marca, procedencia: fields.procedencia,
  }).superRefine((patch, ctx) => { if (!fromScan) requireOrdinaryFields(patch, ctx); });
}
