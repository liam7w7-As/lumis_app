import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

test('offline receipts prevent duplicate clients, sales and payments; document versions detect another device', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host));
  const database = 'lumis_offline_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database; process.env.JWT_SECRET = 'test-only-' + database;
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  let closeServer: (() => Promise<void>) | undefined, closePool: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.(); await closePool?.();
    assert.match(database, /^lumis_offline_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database); await db.end();
  });
  const { runMigrations } = await import('../src/db/migrate'); await runMigrations(); await db.changeUser({ database });
  const { pool } = await import('../src/db/pool'); closePool = () => pool.end();
  const { createApp } = await import('../src/app');
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = async (url: string, token?: string, method = 'GET', body?: unknown, expected = 200, headers: Record<string, string> = {}) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return { data, headers: response.headers };
  };
  const op = (name: string, version?: string) => ({ 'X-Lumis-Operation-Id': 'offline-test-' + name, ...(version ? { 'X-Lumis-Base-Version': version } : {}) });
  const signup = async (username: string) => (await call('/api/auth/register', undefined, 'POST', { username, name: username, password: 'test-only-12345' }, 201)).data;
  const a = await signup('offline_a'), b = await signup('offline_b');
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id=?", [a.user.businessId]);
  const first = await call('/api/clients', a.token, 'POST', { name: 'Cliente local' }, 201, op('client'));
  const replay = await call('/api/clients', a.token, 'POST', { name: 'Cliente local' }, 201, op('client'));
  assert.deepEqual(replay.data, first.data); assert.equal(replay.headers.get('X-Lumis-Operation-Replayed'), '1');
  assert.equal(replay.headers.get('X-Lumis-Offline-Version'), '1');
  assert.equal((await call('/api/clients', a.token, 'POST', { name: 'Datos diferentes' }, 409, op('client'))).data.code, 'OFFLINE_OPERATION_CONFLICT');
  const other = await call('/api/clients', b.token, 'POST', { name: 'Cliente local' }, 201, op('client'));
  assert.notEqual(other.data.client.id, first.data.client.id);
  await call('/api/auth/users', a.token, 'POST', { username: 'offline_seller', name: 'Vendedor', password: 'test-only-12345' }, 201);
  const seller = (await call('/api/auth/login', undefined, 'POST', { username: 'offline_seller', password: 'test-only-12345' })).data;
  const sameCompany = await call('/api/clients', seller.token, 'POST', { name: 'Cliente local' }, 201, op('client'));
  assert.notEqual(sameCompany.data.client.id, first.data.client.id, 'Operation keys must also be scoped to the user');
  const branch = await call('/api/branches', a.token, 'POST', { name: 'Sucursal sincronizada' }, 201, op('branch-admin'));
  await db.query("UPDATE users SET role='seller' WHERE id=?", [a.user.id]);
  await call('/api/branches', a.token, 'POST', { name: 'Sucursal sincronizada' }, 403, op('branch-admin'));
  await db.query("UPDATE users SET role='admin' WHERE id=?", [a.user.id]);
  assert.deepEqual((await call('/api/branches', a.token, 'POST', { name: 'Sucursal sincronizada' }, 201, op('branch-admin'))).data, branch.data);
  await call('/api/clients', undefined, 'POST', { name: 'Sin acceso' }, 401, op('unauthenticated'));
  await call('/api/clients', a.token, 'POST', { name: 'Clave corta' }, 400, { 'X-Lumis-Operation-Id': 'short' });
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => fetch(base + '/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.token, ...op('concurrent') }, body: JSON.stringify({ name: 'Solo una vez' }) })));
  assert.ok(concurrent.every(response => [201, 409].includes(response.status)));
  const [counts] = await db.query<any[]>("SELECT COUNT(*) AS n FROM clients WHERE business_id=? AND name='Solo una vez'", [a.user.businessId]);
  assert.equal(Number(counts[0].n), 1);

  const items = [{ description: 'Artículo offline', quantity: 2, unit: 'Unidad', unitPrice: 100 }];
  const saleBody = { clientId: first.data.client.id, metodoPago: 'por_pagar', items };
  const created = await call('/api/sales', a.token, 'POST', saleBody, 201, op('create-sale'));
  const repeatedCreation = await call('/api/sales', a.token, 'POST', saleBody, 201, op('create-sale'));
  assert.deepEqual(repeatedCreation.data, created.data);
  const salePath = '/api/sales/' + created.data.sale.id;
  const sale = await call(salePath, a.token);
  const version = sale.headers.get('X-Lumis-Document-Version')!; assert.match(version, /^[a-f0-9]{64}$/);
  assert.equal(created.headers.get('X-Lumis-Document-Version'), version);
  assert.equal(repeatedCreation.headers.get('X-Lumis-Document-Version'), version);
  const saved = await call(salePath, a.token, 'PATCH', { notes: 'Desde primer equipo' }, 200, op('first-edit', version));
  const next = saved.headers.get('X-Lumis-Document-Version')!; assert.notEqual(next, version);
  assert.equal((await call(salePath, a.token, 'PATCH', { notes: 'Segundo equipo sin actualizar' }, 409, op('stale-edit', version))).data.code, 'OFFLINE_DOCUMENT_CONFLICT');
  assert.equal((await call(salePath, a.token)).data.sale.notes, 'Desde primer equipo');
  const repeatedAfterAnotherEdit = await call('/api/sales', a.token, 'POST', saleBody, 201, op('create-sale'));
  assert.equal(repeatedAfterAnotherEdit.headers.get('X-Lumis-Document-Version'), version, 'Creation replay must preserve its original receipt version');
  const duplicated = await call(salePath + '/duplicate', a.token, 'POST', {}, 201, op('duplicate-sale'));
  assert.equal(duplicated.headers.get('X-Lumis-Document-Version'), (await call('/api/sales/' + duplicated.data.sale.id, a.token)).headers.get('X-Lumis-Document-Version'));
  const quote = await call('/api/quotes', a.token, 'POST', { items }, 201, op('create-quote'));
  assert.equal(quote.headers.get('X-Lumis-Document-Version'), (await call('/api/quotes/' + quote.data.quote.id, a.token)).headers.get('X-Lumis-Document-Version'));
  const converted = await call('/api/sales/from-quote', a.token, 'POST', { quoteId: quote.data.quote.id }, 201, op('convert-quote'));
  assert.equal(converted.headers.get('X-Lumis-Document-Version'), (await call('/api/sales/' + converted.data.sale.id, a.token)).headers.get('X-Lumis-Document-Version'));
  // A committed edit can still be acknowledged using the original baseline.
  const editReplay = await call(salePath, a.token, 'PATCH', { notes: 'Desde primer equipo' }, 200, op('first-edit', version));
  assert.equal(editReplay.headers.get('X-Lumis-Operation-Replayed'), '1'); assert.equal(editReplay.headers.get('X-Lumis-Document-Version'), next);
  const itemId = sale.data.sale.items[0].id;
  await call(salePath + '/items/' + itemId, a.token, 'PATCH', { description: 'Cambio conectado' });
  assert.equal((await call(salePath, a.token, 'PATCH', { notes: 'Otro cambio' }, 409, op('child-stale', next))).data.code, 'OFFLINE_DOCUMENT_CONFLICT');
  const concurrentBase = (await call(salePath, a.token)).headers.get('X-Lumis-Document-Version')!;
  const concurrentEdits = await Promise.all(['A', 'B'].map(label => fetch(base + salePath, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.token, ...op('parallel-' + label, concurrentBase) }, body: JSON.stringify({ notes: 'Paralelo ' + label }) })));
  assert.deepEqual(concurrentEdits.map(response => response.status).sort(), [200, 409], 'Only one device may update the same baseline');
  await call(salePath, b.token, 'GET', undefined, 404);

  // Lose the connection while the payment is waiting for the business row lock.
  // The server must finish and persist the receipt even though no HTTP response
  // reaches the phone; resending the same outbox operation must not charge twice.
  const block = await pool.getConnection();
  await block.beginTransaction(); await block.query('SELECT id FROM sales WHERE id=? FOR UPDATE', [created.data.sale.id]);
  const controller = new AbortController();
  const lost = fetch(base + salePath + '/payments', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.token, ...op('lost-payment') }, body: JSON.stringify({ monto: 40 }) }).catch(() => null);
  async function waitState(id: string, state: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const [rows] = await db.query<any[]>('SELECT state FROM offline_operations WHERE business_id=? AND user_id=? AND operation_id=?', [a.user.businessId, a.user.id, 'offline-test-' + id]);
      if (rows[0]?.state === state) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('Expected durable operation state: ' + state);
  }
  await waitState('lost-payment', 'pending'); controller.abort(); await lost;
  await block.commit(); block.release(); await waitState('lost-payment', 'complete');
  const recovered = await call(salePath + '/payments', a.token, 'POST', { monto: 40 }, 201, op('lost-payment'));
  assert.equal(recovered.headers.get('X-Lumis-Operation-Replayed'), '1');
  assert.equal((await call(salePath, a.token)).data.sale.totalPagado, 40);
  const [payments] = await db.query<any[]>('SELECT COUNT(*) AS n FROM sale_payments WHERE sale_id=?', [created.data.sale.id]); assert.equal(Number(payments[0].n), 1);

  // Simulate the narrow crash gap after a write may have committed but before
  // its receipt was recorded. Never release this key into a fresh write.
  const fingerprint = createHash('sha256').update(JSON.stringify({ body: { name: 'No repetir' }, method: 'POST', path: '/api/clients' })).digest('hex');
  await db.query('INSERT INTO offline_operations (business_id,user_id,operation_id,request_hash,state) VALUES(?,?,?,?,?)', [a.user.businessId, a.user.id, 'offline-test-crash-gap', fingerprint, 'pending']);
  assert.equal((await call('/api/clients', a.token, 'POST', { name: 'No repetir' }, 409, op('crash-gap'))).data.code, 'OFFLINE_OPERATION_PENDING');
  await db.query("UPDATE offline_operations SET state='uncertain' WHERE operation_id='offline-test-crash-gap'");
  assert.equal((await call('/api/clients', a.token, 'POST', { name: 'No repetir' }, 409, op('crash-gap'))).data.code, 'OFFLINE_OUTCOME_UNKNOWN');
  await db.query('UPDATE users SET enabled=0 WHERE id=?', [a.user.id]);
  await call('/api/clients', a.token, 'POST', { name: 'Cliente local' }, 401, op('client'));
});
