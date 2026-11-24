import test from 'node:test';
import assert from 'node:assert/strict';

test('quote client names persist only in their document, with tenant and license checks', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host));
  const database = 'lumis_quote_name_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database; process.env.JWT_SECRET = 'test-only-' + database;
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  let closeServer: (() => Promise<void>) | undefined, closePool: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.(); await closePool?.();
    assert.match(database, /^lumis_quote_name_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database); await db.end();
  });
  const { runMigrations } = await import('../src/db/migrate'); await runMigrations();
  await db.changeUser({ database });
  const { pool } = await import('../src/db/pool'); closePool = () => pool.end();
  const { createApp } = await import('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = async (url: string, token?: string, method = 'GET', body?: unknown, status = 200) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await res.json(); assert.equal(res.status, status, JSON.stringify(result)); return result;
  };
  const signup = (username: string) => call('/api/auth/register', undefined, 'POST', { username, name: username, password: 'test-only-12345' }, 201);
  const a = await signup('quote_name_a'), b = await signup('quote_name_b');
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id IN (?,?)", [a.user.businessId, b.user.businessId]);
  const client = (await call('/api/clients', a.token, 'POST', { name: 'Cliente del catálogo', phone: '70000000', address: 'Dirección del catálogo' }, 201)).client;
  const create = async (clientId: number | null) => (await call('/api/quotes', a.token, 'POST', { clientId, items: [{ description: 'Artículo', quantity: 1, unit: 'Unidad', unitPrice: 50 }] }, 201)).quote;
  const first = await create(client.id), other = await create(client.id), anonymous = await create(null);
  const url = '/api/quotes/' + first.id;
  const custom = 'Cliente & Proyecto <Norte>';
  await call(url, a.token, 'PATCH', { clientName: '  ' + custom + '  ' });
  const quote = (await call(url, a.token)).quote;
  assert.equal(quote.clientName, custom); assert.equal(quote.client.name, client.name);
  assert.equal((await call('/api/quotes/' + other.id, a.token)).quote.clientName, client.name);
  assert.equal((await call('/api/clients', a.token)).clients[0].name, client.name);
  assert.equal((await call('/api/quotes', a.token)).quotes.find((q: { id: number }) => q.id === first.id).clientName, custom);
  await call('/api/quotes/' + anonymous.id, a.token, 'PATCH', { clientName: 'Cliente sin ficha' });
  assert.equal((await call('/api/quotes/' + anonymous.id, a.token)).quote.clientName, 'Cliente sin ficha');
  const duplicate = (await call(url + '/duplicate', a.token, 'POST', {}, 201)).quote;
  assert.equal((await call('/api/quotes/' + duplicate.id, a.token)).quote.clientName, custom);
  const { buildQuoteHtml } = await import('../../mobile/src/lib/quoteDocument');
  const { sampleBusiness, sampleFonts, sampleImages } = await import('../../../tests/mobile/documentFixtures');
  const html = buildQuoteHtml({ quote, business: sampleBusiness, fonts: sampleFonts, images: sampleImages, branchName: null });
  assert.ok(html.includes('Cliente &amp; Proyecto &lt;Norte&gt;'));
  assert.equal(quote.clientDetails.address, 'Dirección del catálogo');
  const details = { name: custom, phone: '71111111', email: 'proyecto@example.com', address: 'Proyecto <Norte>', nit: '123456' };
  for (const endpoint of [url, '/api/sales/' + (await call('/api/sales', a.token, 'POST', { clientId: client.id, metodoPago: 'por_pagar', items: [{ description: 'Artículo', quantity: 1, unit: 'Unidad', unitPrice: 50 }] }, 201)).sale.id]) {
    const key = endpoint.includes('/quotes/') ? 'quote' : 'sale';
    await call(endpoint, a.token, 'PATCH', { clientDetails: details });
    const saved = (await call(endpoint, a.token))[key];
    assert.deepEqual(saved.clientDetails, details); assert.equal(saved.clientName, custom);
    assert.equal(saved.client.name, client.name); assert.equal(saved.client.phone, '70000000');
    const copy = (await call(endpoint + '/duplicate', a.token, 'POST', {}, 201))[key];
    assert.deepEqual((await call(endpoint.split('/').slice(0, -1).join('/') + '/' + copy.id, a.token))[key].clientDetails, details);
    for (const invalid of [{ ...details, name: '' }, { ...details, email: 'invalid' }, { ...details, address: 'x'.repeat(256) }, { ...details, businessId: b.user.businessId }, null]) {
      await call(endpoint, a.token, 'PATCH', { clientDetails: invalid }, 400);
    }
    assert.deepEqual((await call(endpoint, a.token))[key].clientDetails, details);
    await call(endpoint, b.token, 'PATCH', { clientDetails: details }, 404);
    await call(endpoint, undefined, 'PATCH', { clientDetails: details }, 401);
    await db.query("UPDATE business_licenses SET plan='gratis',expires_at=NULL WHERE business_id=?", [a.user.businessId]);
    await call(endpoint, a.token, 'PATCH', { clientDetails: details }, 403);
    await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id=?", [a.user.businessId]);
    await call(endpoint, a.token, 'PATCH', { clientDetails: { ...details, phone: null, address: null } });
    const cleared = (await call(endpoint, a.token))[key].clientDetails;
    assert.equal(cleared.phone, null); assert.equal(cleared.address, null);
    await call(endpoint, a.token, 'PATCH', { clientDetails: details });
  }
  assert.equal((await call('/api/clients', a.token)).clients[0].phone, '70000000');
  assert.equal((await call('/api/quotes/' + other.id, a.token)).quote.clientDetails.phone, '70000000');
  const converted = (await call('/api/sales/from-quote', a.token, 'POST', { quoteId: first.id }, 201)).sale;
  assert.deepEqual((await call('/api/sales/' + converted.id, a.token)).sale.clientDetails, details);
  await call(url, a.token, 'PATCH', { clientDetails: details }, 409);
  const changed = (await call(url, a.token)).quote;
  const detailsHtml = buildQuoteHtml({ quote: changed, business: sampleBusiness, fonts: sampleFonts, images: sampleImages, branchName: null });
  assert.ok(detailsHtml.includes('Proyecto &lt;Norte&gt;')); assert.ok(detailsHtml.includes('proyecto@example.com'));
  for (const value of ['', '   ', null, 'a'.repeat(151)]) await call(url, a.token, 'PATCH', { clientName: value }, 400);
  await call(url, b.token, 'PATCH', { clientName: 'Otra empresa' }, 404);
  await call(url, undefined, 'PATCH', { clientName: 'Sin sesión' }, 401);
  await db.query("UPDATE business_licenses SET plan='gratis',expires_at=NULL WHERE business_id=?", [a.user.businessId]);
  await call(url, a.token, 'PATCH', { clientName: 'Sin plan de edición' }, 403);
  await db.query("UPDATE business_licenses SET plan='pro',expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) WHERE business_id=?", [a.user.businessId]);
  await db.query("UPDATE quotes SET status='convertida' WHERE id=?", [first.id]);
  await call(url, a.token, 'PATCH', { clientName: 'Convertida' }, 409);
  assert.equal((await call(url, a.token)).quote.clientName, custom);
});
