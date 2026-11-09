import test from 'node:test';
import assert from 'node:assert/strict';
import { saleSources, suggestSources, type StockLine } from '../../apps/mobile/src/lib/saleStock';
import { newOperationUuid, type StockSnapshot } from '../../apps/mobile/src/lib/novaled';
const stock: StockSnapshot = { branchId: 1, usesLocations: true, locations: [{ id: 10,name: 'Almacén / Zona A' },{ id: 20,name: 'Tienda / Mostrador' }],
  products: [{ id: 7,quantity: 8,canManualEntry: false,sources: [{ locationId: 10,name: 'Zona A',quantity: 5 },{ locationId: 20,name: 'Mostrador',quantity: 3 }] }] };
test('dos filas del mismo producto comparten el stock y no reservan dos veces las mismas unidades', () => {
  const items: StockLine[] = [{ key: 'a',productId: 7,quantity: '4' },{ key: 'b',productId: 7,quantity: '4' }];
  const result = suggestSources(items,stock);
  assert.deepEqual(result,{ a: { 10: '4' }, b: { 10: '1',20: '3' } });
  assert.deepEqual(saleSources(items[1],result.b,stock),[{ sub_ubicacion_id: 10,cantidad: 1 },{ sub_ubicacion_id: 20,cantidad: 3 }]);
});
test('el reparto manual tiene prioridad y una falta de stock impide construir la venta', () => {
  const items: StockLine[] = [{ key: 'a',productId: 7,quantity: '5' },{ key: 'b',productId: 7,quantity: '3',sources: { 10: '3' } }];
  assert.deepEqual(suggestSources(items,stock),{ a: { 10: '2',20: '3' }, b: { 10: '3' } });
  const short: StockLine = { key: 'x',productId: 7,quantity: '9' };
  assert.throws(() => saleSources(short,suggestSources([short],stock).x,stock), /Reparte toda la cantidad/);
  assert.throws(() => saleSources({ ...short,quantity: '1' },{ 999: '1' },stock), /ubicaciones activas/);
});
test('una entrada inicial se asigna a su ubicación y queda primera en el envío', () => {
  const item: StockLine = { key: 'free',productId: null,quantity: '2,50',entry: { quantity: '2.5',cost: '30',reason: 'Ingreso confirmado',locationId: 20 } };
  const selected = suggestSources([item],stock).free;
  assert.deepEqual(selected,{ 20: '2.5' });
  assert.deepEqual(saleSources(item,selected,stock),[{ sub_ubicacion_id: 20,cantidad: 2.5 }]);
  const mixed: StockLine = { key: 'mixed',productId: 7,quantity: '2',sources: { 10: '1',20: '1' },entry: { quantity: '1',cost: '30',reason: 'Ingreso',locationId: 20 } };
  assert.equal(saleSources(mixed,mixed.sources!,stock)[0].sub_ubicacion_id,20);
});
test('stock general y claves de cobro conservan el formato que exige Novaled', () => {
  const general: StockSnapshot = { branchId: 1,usesLocations: false,locations: [{ id: null,name: 'Stock general' }],
    products: [{ id: 7,quantity: 2,canManualEntry: false,sources: [{ locationId: null,name: 'Stock general',quantity: 2 }] }] };
  const item = { key: 'a',productId: 7,quantity: '2' };
  assert.deepEqual(saleSources(item,suggestSources([item],general).a,general),[{ sub_ubicacion_id: null,cantidad: 2 }]);
  assert.match(newOperationUuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
