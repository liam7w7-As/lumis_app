import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteItemSchema, quoteItemPatchSchema } from '../src/lib/quoteItem';

test('solo los artículos de escaneo admiten nombre, unidad y cantidad ausentes; precio ausente es cero', () => {
  assert.deepEqual(quoteItemSchema.parse({ fromScan: true }), {
    fromScan: true, description: '', quantity: 0, unit: '', unitPrice: 0,
  });
  assert.deepEqual(quoteItemSchema.parse({ fromScan: true, description: null, unit: null, quantity: '', unitPrice: null }), {
    fromScan: true, description: '', quantity: 0, unit: '', unitPrice: 0,
  });
  for (const fromScan of [false, undefined]) {
    assert.equal(quoteItemSchema.safeParse({ fromScan, description: '', unit: '', quantity: 0, unitPrice: 0 }).success, false);
  }
  const ordinary = { description: 'Artículo', quantity: 2, unitPrice: 3 };
  assert.deepEqual(quoteItemSchema.parse(ordinary), { ...ordinary, unit: 'Unidad' });
});

test('datos numéricos corruptos y montos fuera de capacidad no se aceptan como datos faltantes', () => {
  for (const quantity of [-1, NaN, Infinity, '3abc', 100000000])
    assert.equal(quoteItemSchema.safeParse({ fromScan: true, quantity }).success, false);
  for (const unitPrice of [-1, NaN, Infinity, 'precio', 10000000000])
    assert.equal(quoteItemSchema.safeParse({ fromScan: true, unitPrice }).success, false);
  assert.equal(quoteItemSchema.safeParse({ fromScan: true, quantity: 99999999, unitPrice: 9999999999 }).success, false);
});

test('la edición parcial depende del origen guardado y no permite cambiarlo desde el parche', () => {
  assert.deepEqual(quoteItemPatchSchema(true).parse({ description: '', unit: '', quantity: 0, unitPrice: 0 }), {
    description: '', unit: '', quantity: 0, unitPrice: 0,
  });
  assert.deepEqual(quoteItemPatchSchema(true).parse({ marca: '  Marca  ' }), { marca: 'Marca' });
  assert.equal(quoteItemPatchSchema(false).safeParse({ description: '', fromScan: true }).success, false);
  assert.deepEqual(quoteItemPatchSchema(false).parse({ fromScan: true, unitPrice: 0 }), { unitPrice: 0 });
  assert.equal(quoteItemPatchSchema(true).safeParse({ unitPrice: -1 }).success, false);
});
