import test from 'node:test';
import assert from 'node:assert/strict';
import type { RowDataPacket } from 'mysql2/promise';

test('artículos nuevos en documentos: herencia solo al omitir marca/procedencia y borrado explícito', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), 'Solo MySQL local');
  const database = 'lumis_item_creation_test_' + process.pid + '_' + Date.now();
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
    assert.match(database, /^lumis_item_creation_test_\d+_\d+$/);
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
  const a = await signup('item_creation_a'), b = await signup('item_creation_b');
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id IN (?,?)",
    [a.user.businessId, b.user.businessId]);
  const secondSession = await call('/api/auth/login', undefined, 'POST', {
    username: 'item_creation_a', password: 'test-only-12345',
  });
  const product = (await call('/api/products', a.token, 'POST', {
    name: 'Artículo de catálogo', price: 65, stock: 20, unit: 'Unidad',
    codigoInterno: 'CAT-001', marca: 'Marca del catálogo', procedencia: 'Origen del catálogo',
  }, 201)).product;
  const catalogBefore = (await call('/api/products', a.token)).products.find((row: any) => row.id === product.id);
  const variants: { label: string; fields: Record<string, string | null>; expected: [string | null, string | null] }[] = [
    { label: 'Omitidos', fields: {}, expected: ['Marca del catálogo', 'Origen del catálogo'] },
    { label: 'Personalizados', fields: { marca: '  Marca del documento  ', procedencia: '  Origen del documento  ' }, expected: ['Marca del documento', 'Origen del documento'] },
    { label: 'Nulos', fields: { marca: null, procedencia: null }, expected: [null, null] },
    { label: 'Vacíos', fields: { marca: '', procedencia: '' }, expected: [null, null] },
    { label: 'Espacios', fields: { marca: '   ', procedencia: '  \t ' }, expected: [null, null] },
    { label: 'Solo marca', fields: { marca: '  Marca particular  ' }, expected: ['Marca particular', 'Origen del catálogo'] },
    { label: 'Solo procedencia', fields: { procedencia: '  Origen particular  ' }, expected: ['Marca del catálogo', 'Origen particular'] },
    { label: 'Límite de columnas', fields: { marca: 'M'.repeat(100), procedencia: 'P'.repeat(100) }, expected: ['M'.repeat(100), 'P'.repeat(100)] },
  ];
  for (const [route, key] of [['quotes', 'quote'], ['sales', 'sale']] as const) {
    await t.test(route, async () => {
      const items = variants.map(variant => ({ productId: product.id, description: variant.label,
        quantity: 2, unitPrice: 7.5, unit: 'Caja', ...variant.fields }));
      const freeItems = [
        { description: 'Libre sin adicionales', quantity: 1, unitPrice: 10 },
        { description: 'Libre con adicionales', quantity: 1, unitPrice: 10, marca: '  Marca libre  ', procedencia: '  Origen libre  ' },
        { description: 'Libre vacío', quantity: 1, unitPrice: 10, marca: '', procedencia: '  ' },
      ];
      const body = { solicitud_id: 'new-details-' + route, metodoPago: 'por_pagar', items: [...items, ...freeItems] };
      const created = (await call('/api/' + route, a.token, 'POST', body, 201))[key];
      if (route === 'quotes') {
        const replay = (await call('/api/quotes', a.token, 'POST', body, 201)).quote;
        assert.equal(replay.id, created.id);
      }
      const url = '/api/' + route + '/' + created.id;
      const saved = (await call(url, secondSession.token))[key];
      assert.equal(saved.total, 150);
      assert.deepEqual(saved.items.slice(0, variants.length).map((item: any) => [item.marca, item.procedencia]), variants.map(variant => variant.expected));
      for (const item of saved.items.slice(0, variants.length)) {
        assert.deepEqual([item.productId, item.quantity, item.unitPrice, item.unit, item.subtotal, item.codigoInterno], [product.id, 2, 7.5, 'Caja', 15, 'CAT-001']);
      }
      assert.deepEqual(saved.items.slice(variants.length).map((item: any) => [item.productId, item.marca, item.procedencia]),
        [[null, null, null], [null, 'Marca libre', 'Origen libre'], [null, null, null]]);
      for (const variant of variants.slice(0, 5)) {
        const added = await call(url + '/items', a.token, 'POST', {
          productId: product.id, description: 'Añadido: ' + variant.label, quantity: 1, unitPrice: 5, ...variant.fields,
        }, 201);
        assert.equal(added.item.subtotal, 5);
        const afterAdd = (await call(url, secondSession.token))[key];
        const addedItem = afterAdd.items.find((item: any) => item.id === added.item.id);
        assert.deepEqual([addedItem.marca, addedItem.procedencia], variant.expected);
        assert.deepEqual(afterAdd.items.slice(0, saved.items.length), saved.items, 'Adding an item must not change historical snapshots');
      }
      const after = (await call(url, a.token))[key];
      assert.equal(after.total, 175);
      const copied = (await call(url + '/duplicate', a.token, 'POST', {}, 201))[key];
      assert.deepEqual((await call('/api/' + route + '/' + copied.id, a.token))[key].items.map((item: any) => [item.marca, item.procedencia]),
        after.items.map((item: any) => [item.marca, item.procedencia]));
      for (const field of ['marca', 'procedencia']) {
        const invalid = { productId: product.id, description: 'No guardar', quantity: 1, unitPrice: 1, [field]: 'X'.repeat(101) };
        await call('/api/' + route, a.token, 'POST', { items: [invalid] }, 400);
        await call(url + '/items', a.token, 'POST', invalid, 400);
      }
      await call('/api/' + route, b.token, 'POST', { items: [items[0]] }, 404);
      await call(url + '/items', b.token, 'POST', items[0], 404);
      assert.deepEqual((await call(url, a.token))[key].items, after.items);
      assert.deepEqual((await call('/api/products', a.token)).products.find((row: any) => row.id === product.id), catalogBefore,
        'Overriding or clearing document metadata must never update the catalog');
    });
  }
  const reused = (await call('/api/quotes', a.token, 'POST', { items: [{ createProduct: true,
    description: product.name, quantity: 1, unit: 'Unidad', unitPrice: 8, marca: null, procedencia: '' }] }, 201)).quote;
  const reusedItem = (await call('/api/quotes/' + reused.id, a.token)).quote.items[0];
  assert.deepEqual([reusedItem.productId, reusedItem.marca, reusedItem.procedencia], [product.id, null, null]);
  assert.deepEqual((await call('/api/products', a.token)).products.find((row: any) => row.id === product.id), catalogBefore);
  const [rows] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM products WHERE business_id=?', [a.user.businessId]);
  assert.equal(Number(rows[0].total), 1, 'Free lines and reuse must not create or rewrite catalog products');
});
