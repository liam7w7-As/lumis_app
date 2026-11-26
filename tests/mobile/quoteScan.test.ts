import test from 'node:test';
import assert from 'node:assert/strict';
import type { Product, QuoteScanLine } from '../../apps/mobile/src/lib/api';
import { newScanProduct, reviewScanLines, scannedQuoteItems, scanFieldText, scanReviewError, selectScanProduct } from '../../apps/mobile/src/lib/quoteScan';

const product: Product = { id: 41, name: 'Interruptor 32A', price: 65, unit: 'Unidad', stock: 12,
  description: null, codigoInterno: 'TM-32', marca: 'Aurora', procedencia: 'Bolivia' };
const source = (patch: Partial<QuoteScanLine> = {}): QuoteScanLine => ({
  name: 'Interruptor 32A', quantity: 2, unit: null, unitPrice: null,
  candidates: [product], selectedProductId: product.id, match: 'exact', ...patch,
});

test('los datos ausentes se muestran vacíos, incluidos los marcadores de texto null y undefined', () => {
  for (const value of [null, undefined, 'null', ' NULL ', 'undefined', 'Undefined', '', '  ', NaN])
    assert.equal(scanFieldText(value), '');
  const [empty] = reviewScanLines([source({ match: 'none', candidates: [], selectedProductId: null,
    quantity: null, unit: 'null', unitPrice: null, codigoInterno: 'null' })]);
  assert.equal(empty.quantity, '');
  assert.equal(empty.unit, '');
  assert.equal(empty.unitPrice, '');
  assert.equal(empty.source.codigoInterno, null);
});

test('los datos detectados se precargan sin convertir el precio cero en un campo vacío', () => {
  const [row] = reviewScanLines([source({ match: 'none', candidates: [], selectedProductId: null,
    name: 'Cable 2.5 mm', quantity: 1.5, unit: 'Metro', unitPrice: 0, codigoInterno: 'NULL-001' })]);
  assert.equal(row.name, 'Cable 2.5 mm');
  assert.equal(row.quantity, '1.5');
  assert.equal(row.unit, 'Metro');
  assert.equal(row.unitPrice, '0');
  assert.equal(scanReviewError(row), null);
  assert.equal(scannedQuoteItems([row])[0].codigoInterno, 'NULL-001');
});

test('una coincidencia exacta usa identidad y datos reales del catálogo; no cambia la cantidad leída', () => {
  const [row] = reviewScanLines([source({ unitPrice: 999, unit: 'Caja' })]);
  assert.equal(row.unitPrice, '65');
  assert.equal(row.unit, 'Unidad');
  const [item] = scannedQuoteItems([row]);
  assert.deepEqual(item, { productId: 41, name: 'Interruptor 32A', quantity: 2, unit: 'Unidad',
    unitPrice: 65, marca: 'Aurora', procedencia: 'Bolivia', codigoInterno: 'TM-32' });
});

test('las sugerencias no se confirman solas y una cantidad ilegible permanece vacía', () => {
  const [row] = reviewScanLines([source({ match: 'suggested', name: 'Interruptor 63A', quantity: null })]);
  assert.equal(row.productId, null);
  assert.equal(row.quantity, '');
  assert.match(scanReviewError(row)!, /cantidad/);
  const quantity = { ...row, quantity: '3' };
  assert.match(scanReviewError(quantity)!, /Selecciona un producto/);
  const chosen = selectScanProduct(quantity, product);
  assert.equal(scannedQuoteItems([chosen])[0].productId, product.id);
});

test('un producto nuevo requiere revisión y se marca para crear únicamente al guardar la cotización', () => {
  const [row] = reviewScanLines([source({ name: 'Luminaria nueva', candidates: [], selectedProductId: null, match: 'none' })]);
  assert.equal(row.mode, 'new');
  assert.equal(row.unitPrice, '');
  assert.match(scanReviewError(row)!, /unidad/);
  assert.match(scanReviewError({ ...row, unit: 'Unidad' })!, /precio/);
  const [item] = scannedQuoteItems([{ ...row, unit: 'Unidad', unitPrice: '12,50', quantity: '1,5' }]);
  assert.equal(item.productId, null);
  assert.equal(item.createProduct, true);
  assert.equal(item.unitPrice, 12.5);
  assert.equal(item.quantity, 1.5);
});

test('quitar una coincidencia no copia su precio a otro producto y no borra una edición al pulsar la opción ya activa', () => {
  const [row] = reviewScanLines([source({ name: 'Interruptor leído distinto' })]);
  const fresh = newScanProduct(row);
  assert.equal(fresh.name, 'Interruptor leído distinto');
  assert.equal(fresh.unitPrice, '');
  const edited = { ...fresh, unit: 'Unidad', unitPrice: '80' };
  assert.equal(newScanProduct(edited), edited);
  const selected = { ...selectScanProduct(fresh, product), unitPrice: '70' };
  assert.equal(selectScanProduct(selected, product), selected);
});

test('los productos excluidos no se añaden ni impiden confirmar y se rechazan números parciales', () => {
  const rows = reviewScanLines([source(), source({ quantity: null, candidates: [], selectedProductId: null, match: 'none' })]);
  rows[1].included = false;
  assert.equal(scannedQuoteItems(rows).length, 1);
  assert.equal(scanReviewError(rows[1]), null);
  assert.throws(() => scannedQuoteItems(rows.map(row => ({ ...row, included: false }))), /al menos un producto/);
  for (const quantity of ['3abc', '1.2.3', '-2', '0', '1,234', '1e3'])
    assert.match(scanReviewError({ ...rows[0], quantity })!, /cantidad/);
  assert.equal(scanReviewError({ ...rows[0], unitPrice: '0' }), null, 'Un precio cero debe ser explícito, no un valor supuesto');
});

test('el nombre de un producto nuevo respeta el límite de catálogo sin reducir descripciones existentes', () => {
  const [existing] = reviewScanLines([source()]);
  assert.equal(scanReviewError({ ...existing, name: 'A'.repeat(200) }), null);
  const fresh = { ...newScanProduct(existing), name: 'A'.repeat(151), unit: 'Unidad', unitPrice: '1' };
  assert.match(scanReviewError(fresh)!, /150 caracteres/);
  assert.equal(scanReviewError({ ...fresh, name: 'A'.repeat(150) }), null);
});
