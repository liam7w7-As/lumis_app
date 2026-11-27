import test from 'node:test';
import assert from 'node:assert/strict';

test('client suggestions search all company records, rank matches, and preserve literal characters and tenant isolation', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host));
  const database = 'lumis_clients_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database; process.env.JWT_SECRET = 'test-only-' + database;
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  let closeServer: (() => Promise<void>) | undefined, closePool: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.(); await closePool?.();
    assert.match(database, /^lumis_clients_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database); await db.end();
  });
  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations(); await db.changeUser({ database });
  const { pool } = await import('../src/db/pool'); closePool = () => pool.end();
  const { createApp } = await import('../src/app'); const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close(error => error ? reject(error) : resolve());
  });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = async (path: string, token?: string, method = 'GET', body?: unknown, status = 200) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  };
  const signup = (username: string) => call('/api/auth/register', undefined, 'POST', { username, name: username, password: 'test-only-12345' }, 201);
  const a = await signup('client_search_a'), b = await signup('client_search_b');
  const values = Array.from({ length: 215 }, (_, i) => [a.user.businessId, a.user.id, 'A Cliente ' + String(i).padStart(3, '0')]);
  await db.query('INSERT INTO clients(business_id,user_id,name) VALUES ?', [values]);
  const create = (name: string, token = a.token) => call('/api/clients', token, 'POST', { name }, 201);
  const distant = (await create('ZZZ UMSA')).client;
  const exact = (await create('UMSA')).client;
  const prefix = (await create('UMSA Institución')).client;
  const accent = (await create('Álvaro Ñúñez')).client;
  const special = (await create('Cliente 50%_! \\ literal')).client;
  const hidden = (await create('UMSA Privado', b.token)).client;
  const legacy = await call('/api/clients', a.token);
  assert.equal(legacy.clients.length, 200); assert.equal(legacy.meta, undefined);
  assert.ok(!legacy.clients.some((item: { id: number }) => item.id === distant.id));
  const search = await call('/api/clients?search=umsa&page=1', a.token);
  assert.deepEqual(search.clients.map((item: { id: number }) => item.id), [exact.id, prefix.id, distant.id]);
  assert.deepEqual(search.meta, { currentPage: 1, lastPage: 1, total: 3 });
  assert.ok(!search.clients.some((item: { id: number }) => item.id === hidden.id));
  assert.equal((await call('/api/clients?search=' + encodeURIComponent('ALVARO NUNEZ'), a.token)).clients[0].id, accent.id);
  for (const literal of ['50%', '_!', '\\ literal', '%_!']) {
    const matches = await call('/api/clients?search=' + encodeURIComponent(literal), a.token);
    assert.deepEqual(matches.clients.map((item: { id: number }) => item.id), [special.id]);
  }
  const first = await call('/api/clients?page=1&search=A%20Cliente', a.token);
  const second = await call('/api/clients?page=2&search=A%20Cliente', a.token);
  assert.equal(first.clients.length, 50); assert.equal(first.meta.total, 215); assert.equal(first.meta.lastPage, 5);
  assert.equal(second.clients.length, 50);
  assert.ok(!first.clients.some((item: { id: number }) => second.clients.some((other: { id: number }) => other.id === item.id)));
  assert.equal((await call('/api/clients?page=100', a.token)).clients.length, 0);
  assert.equal((await call('/api/clients?id=' + distant.id, a.token)).clients[0].id, distant.id);
  assert.deepEqual((await call('/api/clients?id=' + hidden.id, a.token)).clients, []);
  assert.deepEqual((await call('/api/clients?search=No-existe', a.token)).clients, []);
  for (const query of ['page=0', 'page=-1', 'page=1.2', 'page=abc', 'id=0', 'id=abc', 'search=' + 'x'.repeat(151)])
    await call('/api/clients?' + query, a.token, 'GET', undefined, 400);
  await call('/api/clients?search=UMSA', undefined, 'GET', undefined, 401);
});
