import test from 'node:test';
import assert from 'node:assert/strict';
import { bindLegacySession, configureLegacyStorage, readLegacyOperation, rememberLegacyBody, runLegacyOperation } from '../../apps/mobile/src/lib/legacyOperation';

const records = new Map<string, string>();
configureLegacyStorage({ get: async key => records.get(key) ?? null, set: async (key, value) => { records.set(key, value); }, remove: async key => { records.delete(key); } });
const definitive = (error: unknown) => [400, 403, 404, 409, 422].includes((error as { status?: number }).status ?? 0);

test('el formulario original recupera el mismo envío y sus ubicaciones tras perder la respuesta', async () => {
  const path = '/api/sales'; const token = 'original-1'; bindLegacySession(token, 1);
  const body = { branchId: 2, items: [{ productId: 4, quantity: 2, unitPrice: 15 }] };
  let attempts = 0;
  const selections = { 0: { sources: [{ sub_ubicacion_id: 3, cantidad: 2 }] } };
  await assert.rejects(() => runLegacyOperation(path, token, body, 'solicitud_id', () => 'request-first', async payload => {
    attempts++;
    await rememberLegacyBody(path, token, { ...payload, stock_selections: selections });
    throw { status: 0 };
  }, definitive));
  const rotatedToken = 'original-1-renewed'; bindLegacySession(rotatedToken, 1);
  assert.equal((await readLegacyOperation(path, rotatedToken))?.body.solicitud_id, 'request-first');
  const result = await runLegacyOperation(path, rotatedToken, body, 'solicitud_id', () => 'must-not-be-used', async payload => {
    attempts++;
    assert.equal(payload.solicitud_id, 'request-first'); assert.deepEqual(payload.stock_selections, selections);
    return { sale: { id: 7 } };
  }, definitive);
  assert.equal(result.sale.id, 7); assert.equal(attempts, 2);
  assert.equal(await readLegacyOperation(path, token), null);
});

test('dos pulsaciones de Guardar comparten una petición y rechazan datos distintos en curso', async () => {
  const path = '/api/quotes'; const token = 'original-2'; bindLegacySession(token, 2);
  let complete!: (value: number) => void; let calls = 0;
  const response = new Promise<number>(resolve => { complete = resolve; });
  const send = async () => { calls++; return response; };
  const first = runLegacyOperation(path, token, { items: [1] }, 'solicitud_id', () => 'one', send, definitive);
  const second = runLegacyOperation(path, token, { items: [1] }, 'solicitud_id', () => 'two', send, definitive);
  await assert.rejects(() => runLegacyOperation(path, token, { items: [2] }, 'solicitud_id', () => 'three', send, definitive), /otro envío en curso/);
  complete(17); assert.deepEqual(await Promise.all([first, second]), [17, 17]); assert.equal(calls, 1);
});

test('una sesión vencida conserva el envío, otra cuenta no lo hereda y la validación permite corregir', async () => {
  const path = '/api/sales/9/payments'; const token = 'original-3'; bindLegacySession(token, 3);
  const body = { monto: 20 };
  await assert.rejects(() => runLegacyOperation(path, token, body, 'clave_operacion', () => 'payment-one', async () => { throw { status: 401 }; }, definitive));
  assert.equal((await readLegacyOperation(path, token))?.body.clave_operacion, 'payment-one');
  bindLegacySession('other-account', 4); assert.equal(await readLegacyOperation(path, 'other-account'), null);
  await assert.rejects(() => runLegacyOperation(path, token, { monto: 30 }, 'clave_operacion', () => 'new', async () => 0, definitive), /envío anterior pendiente/);
  await assert.rejects(() => runLegacyOperation(path, token, body, 'clave_operacion', () => 'new', async () => { throw { status: 422 }; }, definitive));
  assert.equal(await readLegacyOperation(path, token), null);
  const result = await runLegacyOperation(path, token, { monto: 30 }, 'clave_operacion', () => 'corrected', async payload => payload, definitive);
  assert.equal(result.clave_operacion, 'corrected'); assert.equal(result.monto, 30);
});
