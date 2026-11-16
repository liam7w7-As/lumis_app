import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';

test('escaneo y confirmación: empresa, cupos, reintentos, productos nuevos y solicitudes atómicas', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), 'Solo MySQL local');
  const database = 'lumis_scan_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database; process.env.JWT_SECRET = 'test-only-' + database;
  process.env.OPENAI_API_KEY = 'fake-key-never-sent';
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations();
  await db.changeUser({ database });
  const { pool } = await import('../src/db/pool');
  let closeServer: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.(); await pool.end();
    assert.match(database, /^lumis_scan_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database); await db.end();
  });
  let reads = 0, fail = false;
  let unblock: (() => void) | null = null;
  let delay: Promise<void> | null = null;
  const { ApiError } = await import('../src/middlewares/errorHandler');
  const { createApp } = await import('../src/app');
  const app = createApp({ quoteImageReader: async () => {
    reads += 1;
    if (delay) await delay;
    if (fail) throw new ApiError(503, 'Lector no disponible', 'SCAN_PROVIDER_UNAVAILABLE');
    return [
      { name: 'Interruptor 32A', quantity: 2, unit: null, unitPrice: null, codigoInterno: null },
      { name: 'Cable 2.5mm', quantity: null, unit: null, unitPrice: null, codigoInterno: null },
      { name: 'Artículo nuevo', quantity: 3, unit: 'Unidad', unitPrice: 10, codigoInterno: null },
    ];
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => {
    unblock?.();
    server.closeAllConnections();
    return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
  const base = 'http://127.0.0.1:' + (server.address() as {port:number}).port;
  const call = async (path: string, token?: string, method = 'GET', body?: unknown, status = 200) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, status, path + ' ' + JSON.stringify(result));
    return result;
  };
  const signup = (username: string) => call('/api/auth/register', undefined, 'POST', { username, name: username, password: 'test-only-12345' }, 201);
  const a = await signup('scanner_a'), b = await signup('scanner_b');
  await call('/api/products', a.token, 'POST', { name: 'Interruptor 32A', price: 65, unit: 'Unidad' }, 201);
  await call('/api/products', a.token, 'POST', { name: 'Cable 25mm', price: 50, unit: 'Metro' }, 201);
  const secret = (await call('/api/products', b.token, 'POST', { name: 'Artículo nuevo', price: 777, unit: 'Unidad' }, 201)).product;
  const image = Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64');
  const scanId = randomUUID();
  await call('/api/quotes/scan', undefined, 'POST', { scanId, base64: image }, 401);
  const initial = await call('/api/quotes/scan', a.token, 'POST', { scanId, base64: image });
  assert.equal(reads, 1);
  assert.equal(initial.scan.lines[0].match, 'exact');
  assert.equal(initial.scan.lines[1].match, 'none');
  assert.equal(initial.scan.lines[1].quantity, null);
  assert.deepEqual(initial.scan.lines[2].candidates, []);
  const cached = await call('/api/quotes/scan', a.token, 'POST', { scanId, base64: image });
  assert.deepEqual(cached, initial); assert.equal(reads, 1);
  await call('/api/quotes/scan', a.token, 'POST', { scanId, base64: Buffer.from([137,80,78,71,13,10,26,10,2]).toString('base64') }, 409);
  assert.equal(reads, 1);
  let snapshot = (await call('/api/license', a.token)).license;
  assert.equal(snapshot.scannerAvailable, true);
  assert.equal(snapshot.quotas.scans.used, 1);
  assert.equal((await call('/api/products', a.token)).products.length, 2, 'Escanear no crea productos');
  const body = { solicitud_id: 'scan-confirm-' + randomUUID(), clientId: null, branchId: null, items: [
    { productId: initial.scan.lines[0].selectedProductId, description: 'Interruptor 32A', quantity: 2, unit: 'Unidad', unitPrice: 65 },
    { description: 'Artículo nuevo', quantity: 3, unit: 'Unidad', unitPrice: 10, createProduct: true },
  ] };
  const [created, retry] = await Promise.all([
    call('/api/quotes', a.token, 'POST', body, 201), call('/api/quotes', a.token, 'POST', body, 201),
  ]);
  assert.deepEqual(retry, created);
  const products = (await call('/api/products', a.token)).products;
  assert.equal(products.length, 3);
  const fresh = products.find((p: {name:string}) => p.name === 'Artículo nuevo');
  assert.equal(fresh.stock, 0); assert.equal(fresh.price, 10); assert.notEqual(fresh.id, secret.id);
  assert.equal((await call('/api/license', a.token)).license.quotas.quotes.used, 1);
  await db.query("UPDATE license_usage SET used=5 WHERE business_id=? AND meter='quotes'",[a.user.businessId]);
  assert.deepEqual(await call('/api/quotes', a.token, 'POST', body, 201), created, 'La última cotización puede recuperarse después de agotar el cupo');
  await db.query("UPDATE license_usage SET used=1 WHERE business_id=? AND meter='quotes'",[a.user.businessId]);
  await call('/api/quotes', a.token, 'POST', { ...body, items: [{...body.items[1], quantity:4}] }, 409);
  assert.equal((await call('/api/products', a.token)).products.length, 3);
  const invalid = { solicitud_id: 'invalid-' + randomUUID(), items: [{description:'No debe quedar',quantity:1,unit:'Unidad',unitPrice:12,createProduct:true}], clientId:999999 };
  await call('/api/quotes', a.token, 'POST', invalid, 404);
  assert.equal((await call('/api/products', a.token)).products.length, 3);
  const newId = randomUUID();
  fail = true;
  await call('/api/quotes/scan', a.token, 'POST', {scanId:newId,base64:image},503);
  assert.equal((await call('/api/license', a.token)).license.quotas.scans.used, 1);
  fail = false;
  await call('/api/quotes/scan', a.token, 'POST', {scanId:newId,base64:image});
  assert.equal((await call('/api/license', a.token)).license.quotas.scans.used, 2);
  delay = new Promise<void>(resolve => { unblock = resolve; });
  const concurrentId = randomUUID(), beforeReads = reads;
  const running = call('/api/quotes/scan', a.token, 'POST', {scanId:concurrentId,base64:image});
  for (let i=0; i<100 && reads===beforeReads; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(reads, beforeReads + 1);
  await call('/api/quotes/scan', a.token, 'POST', {scanId:concurrentId,base64:image},409);
  assert.equal(reads, beforeReads + 1);
  unblock!(); await running; delay = null;
  await call('/api/quotes/scan', a.token, 'POST', {scanId:randomUUID(),base64:image});
  await call('/api/quotes/scan', a.token, 'POST', {scanId:randomUUID(),base64:image});
  snapshot = (await call('/api/license', a.token)).license;
  assert.equal(snapshot.quotas.scans.used, 5);
  const charged = reads;
  await call('/api/quotes/scan', a.token, 'POST', {scanId:randomUUID(),base64:image},403);
  assert.equal(reads, charged, 'Un cupo agotado no llama al proveedor');
  await call('/api/quotes/scan', a.token, 'POST', {scanId,base64:image});
  assert.equal(reads, charged, 'El resultado confirmado sigue disponible sin cobrar otra vez');
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id=?",[a.user.businessId]);
  const renewed = await call('/api/quotes/scan', a.token, 'POST', {scanId:randomUUID(),base64:image});
  assert.ok(renewed.scan.lines.length);
  const paid = (await call('/api/license', a.token)).license.quotas.scans;
  assert.equal(paid.used, 1); assert.equal(paid.limit, 50); assert.notEqual(paid.period, 'lifetime');
  const repeated = await call('/api/quotes', a.token, 'POST', {
    solicitud_id:'two-lines-' + randomUUID(), items: Array.from({length:2},() =>
      ({description:'Producto repetido en hoja',quantity:1,unit:'Unidad',unitPrice:5,createProduct:true})),
  },201);
  const repeatedDetail = (await call('/api/quotes/' + repeated.quote.id,a.token)).quote;
  assert.equal(repeatedDetail.items[0].productId,repeatedDetail.items[1].productId);
  for(let n=0;n<2;n++)await call('/api/products',a.token,'POST',{name:'Nombre ambiguo',price:10,unit:'Unidad'},201);
  const usedBefore = (await call('/api/license',a.token)).license.quotas.quotes.used;
  await call('/api/quotes',a.token,'POST',{solicitud_id:'rollback-' + randomUUID(),items:[
    {description:'No debe persistir',quantity:1,unit:'Unidad',unitPrice:5,createProduct:true},
    {description:'Nombre ambiguo',quantity:1,unit:'Unidad',unitPrice:10,createProduct:true},
  ]},422);
  assert.equal((await call('/api/products',a.token)).products.some((p:{name:string}) => p.name==='No debe persistir'),false);
  assert.equal((await call('/api/license',a.token)).license.quotas.quotes.used,usedBefore);
  delete process.env.OPENAI_API_KEY;
  const disabledReads=reads;
  assert.equal((await call('/api/license',a.token)).license.scannerAvailable,false);
  await call('/api/quotes/scan',a.token,'POST',{scanId:randomUUID(),base64:image},503);
  assert.equal(reads,disabledReads);
  process.env.OPENAI_API_KEY='fake-key-never-sent';
  await db.query("UPDATE business_licenses SET status='suspended' WHERE business_id=?",[a.user.businessId]);
  await call('/api/quotes/scan', a.token, 'POST', {scanId:randomUUID(),base64:image},403);
});
