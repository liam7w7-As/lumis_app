import test from 'node:test';
import assert from 'node:assert/strict';
import type { RowDataPacket } from 'mysql2/promise';

test('marca y procedencia del documento: edición parcial, borrado, PDF e integridad del catálogo', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), 'Solo MySQL local');
  const database = 'lumis_item_details_test_' + process.pid + '_' + Date.now();
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
    assert.match(database, /^lumis_item_details_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database);
    await db.end();
  });
  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations();
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
  const call = async (url: string, token?: string, method = 'GET', body?: unknown, status = 200) => {
    const response = await fetch(base + url, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json();
    assert.equal(response.status, status, method + ' ' + url + ' ' + JSON.stringify(result));
    return result;
  };
  const signup = (username: string) => call('/api/auth/register', undefined, 'POST', {
    username, name: username, password: 'test-only-12345',
  }, 201);
  const a = await signup('item_details_a'), b = await signup('item_details_b');
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id IN (?,?)",
    [a.user.businessId, b.user.businessId]);
  const secondSession = await call('/api/auth/login', undefined, 'POST', {
    username: 'item_details_a', password: 'test-only-12345',
  });
  const product = (await call('/api/products', a.token, 'POST', {
    name: 'Artículo de catálogo', price: 65, stock: 20, unit: 'Unidad',
    codigoInterno: 'CAT-001', marca: 'Marca de catálogo', procedencia: 'Origen de catálogo',
  }, 201)).product;
  const originalCatalog = (await call('/api/products', a.token)).products;
  const business = (await call('/api/business', a.token)).business;
  // The mobile PDF templates are pure HTML builders; no Expo/native APIs are loaded.
  const { buildQuoteHtml } = await import('../../mobile/src/lib/quoteDocument');
  const { buildDeliveryNoteHtml } = await import('../../mobile/src/lib/deliveryDocument');
  const assets = { branchName: null,
    images: { logo: null, firma: null, sello: null, facebook: null, tiktok: null, instagram: null, linkedin: null, web: null, map: null },
    fonts: { regular: null, medium: null, semibold: null, bold: null }, business,
  };
  for (const [route, key, table] of [['quotes', 'quote', 'quote_items'], ['sales', 'sale', 'sale_items']] as const) {
    await t.test(route, async () => {
      const created = (await call('/api/' + route, a.token, 'POST', { metodoPago: 'por_pagar', items: [
        { productId: product.id, description: 'Artículo en el documento', quantity: 2, unit: 'Caja', unitPrice: 12.5 },
        { description: 'Otro renglón', quantity: 2, unit: 'Unidad', unitPrice: 5 },
      ] }, 201))[key];
      const url = '/api/' + route + '/' + created.id;
      const initial = (await call(url, a.token))[key];
      const item = initial.items[0];
      const itemUrl = url + '/items/' + item.id;
      assert.deepEqual([item.marca, item.procedencia], ['Marca de catálogo', 'Origen de catálogo']);
      if (route === 'sales') await call(url + '/payments', a.token, 'POST', { monto: 10 }, 201);
      const before = (await call(url, a.token))[key];
      const metadata = await call(itemUrl, a.token, 'PATCH', { marca: '  Marca & documento  ', procedencia: '  Bolivia  ' });
      assert.equal(metadata.item.subtotal, 25);
      assert.equal(metadata.total, 35);
      const edited = (await call(url, secondSession.token))[key];
      assert.deepEqual(edited.items[0], { ...item, marca: 'Marca & documento', procedencia: 'Bolivia' });
      assert.deepEqual(edited.items.slice(1), before.items.slice(1));
      assert.equal(edited.total, before.total);
      if (route === 'sales') {
        assert.deepEqual(edited.payments, before.payments);
        assert.equal(edited.totalPagado, before.totalPagado);
        assert.equal(edited.estadoPago, before.estadoPago);
      }
      const html = route === 'quotes'
        ? buildQuoteHtml({ ...assets, quote: edited })
        : buildDeliveryNoteHtml({ ...assets, sale: edited, documentType: 'sale' });
      assert.ok(html.includes('<td class="col-brand">Marca &amp; documento</td>'));
      assert.ok(html.includes('<td class="col-origin">Bolivia</td>'));
      assert.ok(!html.includes('<td class="col-brand">Marca de catálogo</td>'));
      const copied = (await call(url + '/duplicate', a.token, 'POST', {}, 201))[key];
      assert.deepEqual((await call('/api/' + route + '/' + copied.id, a.token))[key].items.map((row: any) => [row.marca, row.procedencia]),
        edited.items.map((row: any) => [row.marca, row.procedencia]));

      await call(itemUrl, a.token, 'PATCH', { marca: 'Solo marca' });
      const oneField = (await call(url, a.token))[key].items[0];
      assert.equal(oneField.marca, 'Solo marca');
      assert.equal(oneField.procedencia, 'Bolivia', 'An omitted origin must not be overwritten');
      const changed = await call(itemUrl, a.token, 'PATCH', { quantity: 3, unitPrice: 7.25 });
      assert.equal(changed.total, 31.75);
      assert.equal(changed.item.subtotal, 21.75);
      const afterPrice = (await call(url, a.token))[key].items[0];
      assert.deepEqual([afterPrice.marca, afterPrice.procedencia], ['Solo marca', 'Bolivia']);

      await call(itemUrl, a.token, 'PATCH', { marca: null, procedencia: '   ' });
      const cleared = (await call(url, secondSession.token))[key];
      assert.deepEqual(cleared.items[0], { ...afterPrice, marca: null, procedencia: null });
      assert.equal(cleared.total, 31.75);
      const [stored] = await db.query<RowDataPacket[]>('SELECT marca, procedencia FROM ' + table + ' WHERE id = ?', [item.id]);
      assert.deepEqual([stored[0].marca, stored[0].procedencia], [null, null]);
      await call(itemUrl, a.token, 'PATCH', { description: 'Descripción final' });
      assert.deepEqual([(await call(url, a.token))[key].items[0].marca, (await call(url, a.token))[key].items[0].procedencia], [null, null]);

      await call(itemUrl, a.token, 'PATCH', { marca: 'M'.repeat(100), procedencia: 'P'.repeat(100) });
      const maximum = (await call(url, a.token))[key].items[0];
      for (const field of ['marca', 'procedencia']) {
        await call(itemUrl, a.token, 'PATCH', { [field]: 'X'.repeat(101), description: 'No guardar' }, 400);
      }
      assert.deepEqual((await call(url, a.token))[key].items[0], maximum, 'Validation failures must not partially update the item');
      await call(itemUrl, a.token, 'PATCH', { marca: '', procedencia: null });
      const cleanedHtml = route === 'quotes'
        ? buildQuoteHtml({ ...assets, quote: (await call(url, a.token))[key] })
        : buildDeliveryNoteHtml({ ...assets, sale: (await call(url, a.token))[key], documentType: 'sale' });
      assert.ok(!cleanedHtml.includes('<td class="col-brand">'));
      assert.ok(!cleanedHtml.includes('<td class="col-origin">'));

      await call(itemUrl, undefined, 'PATCH', { marca: 'No autorizado' }, 401);
      await call(itemUrl, b.token, 'PATCH', { marca: 'Otra empresa' }, 404);
      const foreignItem = (await call('/api/' + route + '/' + copied.id, a.token))[key].items[0].id;
      await call(url + '/items/' + foreignItem, a.token, 'PATCH', { marca: 'Otro documento' }, 404);
      await db.query("UPDATE business_licenses SET plan='free' WHERE business_id=?", [a.user.businessId]);
      const gated = await call(itemUrl, a.token, 'PATCH', { marca: 'Requiere Pro' }, 403);
      assert.equal(gated.code, 'PLAN_FEATURE_REQUIRED');
      await db.query("UPDATE business_licenses SET plan='pro' WHERE business_id=?", [a.user.businessId]);
      if (route === 'quotes') await call(url, a.token, 'PATCH', { status: 'aprobada' });
      else await call(url + '/anular', a.token, 'POST', {});
      await call(itemUrl, a.token, 'PATCH', { marca: 'Documento cerrado' }, 409);
      assert.deepEqual((await call('/api/products', a.token)).products, originalCatalog,
        'Document metadata must never modify product identity, brand, origin, stock or price');
    });
  }
});
