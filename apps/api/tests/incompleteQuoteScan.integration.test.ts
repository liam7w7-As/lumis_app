import test from 'node:test';
import assert from 'node:assert/strict';
import type { RowDataPacket } from 'mysql2/promise';

test('el escaneo incompleto se guarda, vuelve a abrirse, se edita y se duplica sin crear productos inválidos', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), 'Solo MySQL local');
  const database = 'lumis_incomplete_scan_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database;
  process.env.JWT_SECRET = 'test-only-' + database;
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  let closeServer: (() => Promise<void>) | undefined;
  let closePool: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.();
    await closePool?.();
    assert.match(database, /^lumis_incomplete_scan_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database);
    await db.end();
  });
  const { runMigrations } = await import('../src/db/migrate');
  const migrations = await runMigrations();
  assert.ok(migrations.includes('030_quote_scan_origin'));
  await db.changeUser({ database });
  const { pool } = await import('../src/db/pool');
  closePool = () => pool.end();
  const { createApp } = await import('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  let lastHeaders = new Headers();
  const call = async (url: string, token?: string, method = 'GET', body?: unknown, status = 200, extraHeaders: Record<string, string> = {}) => {
    const response = await fetch(base + url, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    lastHeaders = response.headers;
    assert.equal(response.status, status, method + ' ' + url + ' ' + JSON.stringify(result));
    return result;
  };
  const signup = (username: string) => call('/api/auth/register', undefined, 'POST', {
    username, name: username, password: 'test-only-12345',
  }, 201);
  const a = await signup('incomplete_scan_a'), b = await signup('incomplete_scan_b');
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id IN (?,?)",
    [a.user.businessId, b.user.businessId]);
  const body = { solicitud_id: 'incomplete-scan-quote', items: [
    { fromScan: true, createProduct: true },
    { fromScan: true, createProduct: true, description: 'Nombre conservado', unit: 'Unidad', quantity: 2 },
    { fromScan: true, createProduct: true, description: 'L'.repeat(200), unit: '', quantity: 1, unitPrice: 5 },
  ] };
  const created = (await call('/api/quotes', a.token, 'POST', body, 201)).quote;
  assert.equal(created.total, 5);
  assert.equal((await call('/api/quotes', a.token, 'POST', body, 201)).quote.id, created.id, 'Reintentar no duplica la cotización');
  const url = '/api/quotes/' + created.id;
  const saved = (await call(url, a.token)).quote;
  assert.deepEqual(saved.items.map((item: any) => [item.description, item.quantity, item.unit, item.unitPrice, item.subtotal, item.fromScan]), [
    ['', 0, '', 0, 0, true], ['Nombre conservado', 2, 'Unidad', 0, 0, true], ['L'.repeat(200), 1, '', 5, 5, true],
  ]);
  assert.equal(saved.items[0].productId, null);
  assert.equal(saved.items[2].productId, null);
  const [products] = await db.query<RowDataPacket[]>('SELECT name,unit,price FROM products WHERE business_id=?', [a.user.businessId]);
  assert.deepEqual(products.map(row => [row.name, row.unit, Number(row.price)]), [['Nombre conservado', 'Unidad', 0]]);
  await call('/api/quotes', b.token, 'POST', { items: [{ fromScan: true, productId: saved.items[1].productId }] }, 404);
  const secondSession = await call('/api/auth/login', undefined, 'POST', { username: 'incomplete_scan_a', password: 'test-only-12345' });
  assert.deepEqual((await call(url, secondSession.token)).quote.items, saved.items);
  const itemUrl = url + '/items/' + saved.items[0].id;
  await call(itemUrl, a.token, 'PATCH', { marca: 'Marca opcional' });
  let item = (await call(url, a.token)).quote.items[0];
  assert.deepEqual([item.description, item.quantity, item.unit, item.unitPrice, item.marca, item.fromScan], ['', 0, '', 0, 'Marca opcional', true]);
  await call(itemUrl, a.token, 'PATCH', { description: 'Completado', quantity: 4, unit: 'Caja', unitPrice: 3 });
  await call(itemUrl, a.token, 'PATCH', { description: '', quantity: 0, unit: '', unitPrice: 0 });
  item = (await call(url, a.token)).quote.items[0];
  assert.deepEqual([item.description, item.quantity, item.unit, item.unitPrice, item.fromScan], ['', 0, '', 0, true]);
  const copied = (await call(url + '/duplicate', a.token, 'POST', {}, 201)).quote;
  assert.deepEqual((await call('/api/quotes/' + copied.id, a.token)).quote.items.map((row: any) => [row.description, row.quantity, row.unit, row.unitPrice, row.fromScan]),
    (await call(url, a.token)).quote.items.map((row: any) => [row.description, row.quantity, row.unit, row.unitPrice, row.fromScan]));
  const lineCopy = await call(itemUrl + '/duplicate', a.token, 'POST', {}, 201);
  assert.equal((await call(url, a.token)).quote.items.find((row: any) => row.id === lineCopy.item.id).fromScan, true);
  const added = await call(url + '/items', a.token, 'POST', { fromScan: true }, 201);
  assert.equal((await call(url, a.token)).quote.items.find((row: any) => row.id === added.item.id).fromScan, true);
  await call('/api/sales/from-quote', a.token, 'POST', { quoteId: created.id }, 400);
  assert.equal((await call(url, a.token)).quote.status, 'borrador');
  const [sales] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM sales WHERE business_id=?', [a.user.businessId]);
  assert.equal(Number(sales[0].count), 0);
  for (const fromScan of [false, undefined]) {
    await call('/api/quotes', a.token, 'POST', { items: [{ fromScan, description: '', quantity: 0, unit: '', unitPrice: 0 }] }, 400);
  }
  const ordinary = (await call('/api/quotes', a.token, 'POST', { items: [{ description: 'Normal', quantity: 1, unitPrice: 2 }] }, 201)).quote;
  const ordinaryItem = (await call('/api/quotes/' + ordinary.id, a.token)).quote.items[0];
  await call('/api/quotes/' + ordinary.id + '/items/' + ordinaryItem.id, a.token, 'PATCH', { description: '', quantity: 0, unit: '', fromScan: true }, 400);
  await call(itemUrl, b.token, 'PATCH', { unitPrice: 2 }, 404);
  await call('/api/sales', a.token, 'POST', { items: [{ fromScan: true, description: '', quantity: 0, unit: '', unitPrice: 0 }] }, 400);

  const offlineBody = { items: [{ fromScan: true, description: '', quantity: 0, unit: '', unitPrice: 0 }] };
  const operationHeaders = { 'X-Lumis-Operation-Id': 'incomplete-scan-create-offline-1' };
  const synced = (await call('/api/quotes', a.token, 'POST', offlineBody, 201, operationHeaders)).quote;
  assert.match(lastHeaders.get('X-Lumis-Document-Version') ?? '', /^[a-f0-9]{64}$/);
  const replay = (await call('/api/quotes', a.token, 'POST', offlineBody, 201, operationHeaders)).quote;
  assert.equal(replay.id, synced.id);
  assert.equal(lastHeaders.get('X-Lumis-Operation-Replayed'), '1');
  const syncedQuote = (await call('/api/quotes/' + synced.id, secondSession.token)).quote;
  const syncedVersion = lastHeaders.get('X-Lumis-Document-Version')!;
  assert.equal(syncedQuote.items[0].fromScan, true, 'Los clientes reciben el indicador camelCase, no la columna SQL');
  assert.deepEqual([syncedQuote.items[0].description, syncedQuote.items[0].quantity, syncedQuote.items[0].unitPrice], ['', 0, 0]);
  const updateHeaders = { 'X-Lumis-Operation-Id': 'incomplete-scan-patch-offline-1', 'X-Lumis-Base-Version': syncedVersion };
  const syncedItemUrl = '/api/quotes/' + synced.id + '/items/' + syncedQuote.items[0].id;
  await call(syncedItemUrl, a.token, 'PATCH', { marca: 'Sin completar el escaneo' }, 200, updateHeaders);
  await call(syncedItemUrl, a.token, 'PATCH', { marca: 'Sin completar el escaneo' }, 200, updateHeaders);
  assert.equal(lastHeaders.get('X-Lumis-Operation-Replayed'), '1');
  const afterSync = (await call('/api/quotes/' + synced.id, secondSession.token)).quote.items[0];
  assert.deepEqual([afterSync.fromScan, afterSync.description, afterSync.quantity, afterSync.unit, afterSync.unitPrice, afterSync.marca],
    [true, '', 0, '', 0, 'Sin completar el escaneo']);
  for (let count = 0; count < 2; count++) await call('/api/products', a.token, 'POST', {
    name: 'Coincidencia duplicada', unit: 'Unidad', stock: 0, price: count + 1,
  }, 201);
  const ambiguous = (await call('/api/quotes', a.token, 'POST', { items: [{ fromScan: true, createProduct: true,
    description: 'Coincidencia duplicada', unit: 'Unidad', quantity: 1, unitPrice: 0 }] }, 201)).quote;
  assert.equal((await call('/api/quotes/' + ambiguous.id, a.token)).quote.items[0].productId, null,
    'Una coincidencia ambigua queda libre sin impedir guardar ni elegir un producto arbitrario');
});
