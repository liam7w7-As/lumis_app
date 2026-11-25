import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineEngine } from '../../mobile/src/offline/engine';
import { clone, type Reply, type Request, type State, type Store } from '../../mobile/src/offline/types';

test('real mobile engine synchronizes offline catalog, documents, conversion and payments against the actual API', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host));
  const database = 'lumis_mobile_sync_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database; process.env.JWT_SECRET = 'test-only-' + database;
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  let closeServer: (() => Promise<void>) | undefined, closePool: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.(); await closePool?.();
    assert.match(database, /^lumis_mobile_sync_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database); await db.end();
  });
  const { runMigrations } = await import('../src/db/migrate'); await runMigrations(); await db.changeUser({ database });
  const { pool } = await import('../src/db/pool'); closePool = () => pool.end();
  const { createApp } = await import('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const signup = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'real_offline_mobile', name: 'Agente sincronizado', password: 'test-only-12345' }) });
  assert.equal(signup.status, 201); const account = await signup.json();
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id=?", [account.user.businessId]);
  const requests: { path: string; method: string; status: number; operation?: string }[] = [];
  let loseFirstClientReply = true;
  const send = async (path: string, options: Request = {}): Promise<Reply> => {
    const method = options.method ?? 'GET';
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(options.timeoutMs ?? 10000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + account.token, ...options.headers }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
    const data = await response.json(); requests.push({ path, method, status: response.status, operation: options.headers?.['X-Lumis-Operation-Id'] });
    if (!response.ok) throw Object.assign(new Error(data.error ?? data.message ?? 'API request failed'), { status: response.status, code: data.code });
    // The real API committed this client and its durable receipt, but the phone
    // never learns the result. A fresh engine must recover the same row/ID.
    if (loseFirstClientReply && path === '/api/clients' && method === 'POST') {
      loseFirstClientReply = false;
      throw Object.assign(new Error('Respuesta perdida'), { status: 0, code: 'NETWORK_ERROR' });
    }
    return { data, capability: response.headers.get('X-Lumis-Offline-Version') === '1', version: response.headers.get('X-Lumis-Document-Version') ?? undefined };
  };
  const disk = new Map<string, State>();
  const store: Store = { async load(scope) { return disk.has(scope) ? clone(disk.get(scope)!) : null; }, async save(scope, state) { disk.set(scope, clone(state)); } };
  const scope = 'lumis/' + base + '/company-' + account.user.businessId + '/user-' + account.user.id;
  const open = async () => {
    const engine = createOfflineEngine({ store, scope, user: clone(account.user), connected: false, send });
    await engine.initialize(); return engine;
  };
  let engine = await open(); await engine.refresh();
  assert.ok(engine.status().readyAt, engine.status().message); engine.setOnline(false);
  const offlineStart = requests.length;
  const client = (await engine.request('/api/clients', { method: 'POST', body: { name: 'Cliente de campo', phone: '70000111' } })).client;
  const product = (await engine.request('/api/products', { method: 'POST', body: { name: 'Producto de campo', price: 100, unit: 'Unidad', marca: 'M', procedencia: 'Bolivia' } })).product;
  const items = [{ productId: product.id, description: product.name, quantity: 2, unitPrice: 100, unit: 'Unidad', marca: 'M', procedencia: 'Bolivia' }];
  const quote = (await engine.request('/api/quotes', { method: 'POST', body: { clientId: client.id, branchId: null, items } })).quote;
  const sale = (await engine.request('/api/sales', { method: 'POST', body: { clientId: client.id, metodoPago: 'por_pagar', pagoInicial: 20, items } })).sale;
  await engine.request(`/api/sales/${sale.id}/payments`, { method: 'POST', body: { monto: 40, nota: 'Abono en campo' } });
  const converted = (await engine.request('/api/sales/from-quote', { method: 'POST', body: { quoteId: quote.id } })).sale;
  assert.equal(requests.length, offlineStart, 'Offline work must not require a network roundtrip');
  assert.equal((await engine.request(`/api/sales/${sale.id}`)).sale.totalPagado, 60);
  assert.equal(engine.queue().length, 6);
  const initialOperation = engine.queue()[0].id;
  engine.setOnline(true); await engine.synchronize();
  assert.equal(engine.queue()[0].id, initialOperation); assert.equal(engine.queue()[0].code, 'NETWORK_ERROR');
  const [firstCount] = await db.query<any[]>('SELECT COUNT(*) AS n FROM clients WHERE business_id=?', [account.user.businessId]); assert.equal(Number(firstCount[0].n), 1);
  engine.stop(); engine = await open(); engine.setOnline(true); await engine.synchronize();
  assert.deepEqual(engine.queue(), [], JSON.stringify({ queue: engine.queue(), status: engine.status(), requests }, null, 2));
  assert.ok(requests.every(request => request.status < 400), JSON.stringify(requests));
  const [clients] = await db.query<any[]>('SELECT * FROM clients WHERE business_id=?', [account.user.businessId]);
  const [products] = await db.query<any[]>('SELECT * FROM products WHERE business_id=?', [account.user.businessId]);
  const [quotes] = await db.query<any[]>('SELECT * FROM quotes WHERE business_id=?', [account.user.businessId]);
  const [sales] = await db.query<any[]>('SELECT * FROM sales WHERE business_id=? ORDER BY id', [account.user.businessId]);
  assert.equal(clients.length, 1); assert.equal(products.length, 1); assert.equal(quotes.length, 1); assert.equal(sales.length, 2);
  assert.equal(Number(quotes[0].client_id), clients[0].id); assert.equal(quotes[0].status, 'convertida');
  assert.equal(Number(sales[0].client_id), clients[0].id); assert.equal(Number(sales[1].quote_id), quotes[0].id);
  const [quoteItems] = await db.query<any[]>('SELECT product_id FROM quote_items WHERE quote_id=?', [quotes[0].id]); assert.equal(Number(quoteItems[0].product_id), products[0].id);
  const [saleItems] = await db.query<any[]>('SELECT product_id FROM sale_items WHERE sale_id IN (?,?)', sales.map(row => row.id)); assert.ok(saleItems.every(row => Number(row.product_id) === products[0].id));
  const [payments] = await db.query<any[]>('SELECT monto FROM sale_payments WHERE sale_id=? ORDER BY id', [sales[0].id]); assert.deepEqual(payments.map(row => Number(row.monto)), [20, 40]);
  assert.equal((await engine.request(`/api/quotes/${quote.id}`)).quote.id, quote.id);
  assert.equal((await engine.request(`/api/quotes/${quote.id}`)).quote.number, Number(quotes[0].id), 'PDF number must be the server reference, not the temporary navigation ID');
  assert.equal((await engine.request(`/api/quotes/${quote.id}`)).quote.clientName, 'Cliente de campo');
  assert.equal((await engine.request(`/api/sales/${sale.id}`)).sale.totalPagado, 60);
  assert.equal((await engine.request(`/api/sales/${converted.id}`)).sale.total, 200);
  await engine.synchronize();
  const [countsAgain] = await db.query<any[]>('SELECT (SELECT COUNT(*) FROM sales WHERE business_id=?) AS sales,(SELECT COUNT(*) FROM sale_payments WHERE sale_id=?) AS payments', [account.user.businessId, sales[0].id]);
  assert.equal(Number(countsAgain[0].sales), 2); assert.equal(Number(countsAgain[0].payments), 2); engine.stop();
});
