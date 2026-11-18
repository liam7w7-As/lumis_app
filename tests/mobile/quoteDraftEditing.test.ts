import test from 'node:test';
import assert from 'node:assert/strict';
import type { DraftItem } from '../../apps/mobile/src/context/DraftContext';
import { buildQuoteItems, parseQuoteDraftDecimal, quoteDraftErrors, quoteDraftSubtotal, QuoteDraftValidationError } from '../../apps/mobile/src/lib/quoteDraftEditing';

const item = (patch: Partial<DraftItem> = {}): DraftItem => ({ key: 'row-1', productId: 8, name: 'Cable 2.5 mm',
  quantity: 1, unit: 'Unidad', unitPrice: 65, marca: 'Aurora', procedencia: 'Bolivia', ...patch });

test('guardar usa el último texto editado y conserva la identidad del catálogo', () => {
  const original = item({ name: ' Cable de la cotización ', quantityText: '2,50', unitPriceText: '12,40', unit: ' Metro ' });
  const saved = buildQuoteItems([original]);
  assert.deepEqual(saved[0], { productId: 8, description: 'Cable de la cotización', quantity: 2.5, unit: 'Metro', unitPrice: 12.4, marca: 'Aurora', procedencia: 'Bolivia' });
  assert.equal(original.name, ' Cable de la cotización ');
  assert.equal(original.unitPrice, 65, 'La conversión no modifica el objeto ni el producto de origen');
  assert.equal(quoteDraftSubtotal(original), 31);
});

test('vaciar un número no recupera el valor anterior ni lo convierte a cero', () => {
  for (const field of ['quantityText', 'unitPriceText'] as const) {
    const row = item({ [field]: '' });
    assert.equal(quoteDraftSubtotal(row), null);
    assert.throws(() => buildQuoteItems([row]), error => error instanceof QuoteDraftValidationError
      && error.key === 'row-1' && error.field === (field === 'quantityText' ? 'quantity' : 'unitPrice'));
  }
  assert.equal(quoteDraftSubtotal(item({ quantityText: '0', unitPriceText: '10' })), null);
  assert.equal(quoteDraftSubtotal(item({ unitPriceText: '0' })), 0, 'Un precio cero explícito es válido');
});

test('los decimales aceptan coma y separador al escribir, sin aceptar números parciales o demasiados decimales', () => {
  assert.equal(parseQuoteDraftDecimal('1,'), 1);
  assert.equal(parseQuoteDraftDecimal(',25'), 0.25);
  assert.equal(parseQuoteDraftDecimal(' 12.50 '), 12.5);
  for (const value of ['', ' ', '.', ',', '1.234', '2abc', '1e3', '-2', 'NaN', 'Infinity', '1,2.3', '1 000']) {
    assert.equal(parseQuoteDraftDecimal(value), null, value);
  }
  assert.equal(quoteDraftSubtotal(item({ quantityText: '2,5', unitPriceText: '0,10' })), 0.25);
});

test('el producto nuevo usa su nombre y precio revisados al guardar, conservando createProduct', () => {
  const row = item({ productId: null, createProduct: true, name: ' Bisagra revisada ', unitPriceText: '7,50' });
  const saved = buildQuoteItems([row])[0];
  assert.equal(saved.productId, null);
  assert.equal(saved.createProduct, true);
  assert.equal(saved.description, 'Bisagra revisada');
  assert.equal(saved.unitPrice, 7.5);
  assert.ok(quoteDraftErrors({ ...row, name: 'x'.repeat(151) }).name);
  assert.equal(quoteDraftErrors(item({ name: 'x'.repeat(255) })).name, undefined);
  assert.ok(quoteDraftErrors(item({ name: 'x'.repeat(256) })).name);
});

test('límites de cantidad, precio, subtotal y total evitan importes fuera de la base de datos', () => {
  assert.ok(quoteDraftErrors(item({ quantityText: '100000000' })).quantity);
  assert.ok(quoteDraftErrors(item({ unitPriceText: '10000000000' })).unitPrice);
  assert.ok(quoteDraftErrors(item({ quantityText: '2', unitPriceText: '6000000000' })).unitPrice);
  assert.throws(() => buildQuoteItems([item({ unitPrice: 6000000000 }), item({ key: 'row-2', unitPrice: 6000000000 })]),
    error => error instanceof QuoteDraftValidationError && error.key === 'row-2' && /total/.test(error.message));
  assert.ok(quoteDraftErrors(item({ name: ' ' })).name);
  assert.ok(quoteDraftErrors(item({ unit: ' ' })).unit);
});
