import test from 'node:test';
import assert from 'node:assert/strict';

test('original sale keeps its initial payment after later payments, duplicates and conversion', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host));
  const database = 'lumis_initial_payment_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database; process.env.JWT_SECRET = 'test-only-' + database;
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  let closeServer: (() => Promise<void>) | undefined, closePool: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.(); await closePool?.();
    assert.match(database, /^lumis_initial_payment_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database); await db.end();
  });
  const { runMigrations } = await import('../src/db/migrate'); await runMigrations(); await db.changeUser({ database });
  const { pool } = await import('../src/db/pool'); closePool = () => pool.end();
  const { createApp } = await import('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = async (url: string, token?: string, method = 'GET', body?: unknown, status = 200) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  };
  const signup = (username: string) => call('/api/auth/register', undefined, 'POST', { username, name: username, password: 'test-only-12345' }, 201);
  const a = await signup('initial_payment_a'), b = await signup('initial_payment_b');
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id=?", [a.user.businessId]);
  const items = [{ description: 'Artículo', quantity: 2, unit: 'Unidad', unitPrice: 100 }];
  const sale = (await call('/api/sales', a.token, 'POST', { metodoPago: 'por_pagar', pagoInicial: 50, items }, 201)).sale;
  const url = '/api/sales/' + sale.id;
  assert.equal((await call(url, a.token)).sale.initialPayment, 50);
  await call(url + '/payments', a.token, 'POST', { monto: 150 }, 201);
  const paid = (await call(url, a.token)).sale;
  assert.equal(paid.estadoPago, 'pagado'); assert.equal(paid.totalPagado, 200); assert.equal(paid.initialPayment, 50);
  await call(url, a.token, 'PATCH', { initialPayment: 100 }, 400);
  assert.equal((await call(url, a.token)).sale.initialPayment, 50);
  const copy = (await call(url + '/duplicate', a.token, 'POST', {}, 201)).sale;
  assert.equal((await call('/api/sales/' + copy.id, a.token)).sale.initialPayment, 0);
  const cash = (await call('/api/sales', a.token, 'POST', { metodoPago: 'efectivo', items }, 201)).sale;
  assert.equal((await call('/api/sales/' + cash.id, a.token)).sale.initialPayment, 200);
  const quote = (await call('/api/quotes', a.token, 'POST', { items }, 201)).quote;
  const converted = (await call('/api/sales/from-quote', a.token, 'POST', { quoteId: quote.id }, 201)).sale;
  assert.equal((await call('/api/sales/' + converted.id, a.token)).sale.initialPayment, 0);
  await call('/api/sales', a.token, 'POST', { metodoPago: 'por_pagar', pagoInicial: 201, items }, 400);
  await call(url, b.token, 'GET', undefined, 404); await call(url, undefined, 'GET', undefined, 401);
  await db.query('UPDATE sales SET initial_payment=NULL WHERE id=?', [sale.id]);
  assert.equal((await call(url, a.token)).sale.initialPayment, null);
});
