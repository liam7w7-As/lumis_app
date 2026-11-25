import test from 'node:test';
import assert from 'node:assert/strict';

test('el administrador registra vendedores de su empresa con acceso, agente y cupos aislados', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host));
  const database = 'lumis_agents_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database; process.env.JWT_SECRET = 'test-only-' + database;
  const { config } = await import('../src/config'); const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  let closeServer: (() => Promise<void>) | undefined, closePool: (() => Promise<void>) | undefined;
  t.after(async () => { await closeServer?.(); await closePool?.(); assert.match(database, /^lumis_agents_test_\d+_\d+$/); await db.query('DROP DATABASE IF EXISTS ' + database); await db.end(); });
  const { runMigrations } = await import('../src/db/migrate'); await runMigrations(); await db.changeUser({ database });
  const { pool } = await import('../src/db/pool'); closePool = () => pool.end();
  const { createApp } = await import('../src/app'); const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = async (url: string, token?: string, method = 'GET', body?: unknown, status = 200) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  };
  const signup = (username: string) => call('/api/auth/register', undefined, 'POST', { username, name: username, password: 'test-only-12345' }, 201);
  const a = await signup('agents_admin_a'), b = await signup('agents_admin_b');
  const seller = (await call('/api/auth/users', a.token, 'POST', { username: 'new_seller', name: 'Agente creado', password: 'test-only-12345', businessId: b.user.businessId, role: 'admin' }, 201)).user;
  assert.equal(seller.businessId, a.user.businessId); assert.equal(seller.role, 'seller'); assert.equal(seller.password_hash, undefined);
  const login = await call('/api/auth/login', undefined, 'POST', { username: 'NEW_SELLER', password: 'test-only-12345' });
  assert.equal(login.user.businessId, a.user.businessId); assert.equal(login.user.role, 'seller');
  const agents = (await call('/api/agents', login.token)).agents;
  const linked = agents.find((agent: { accountId: number }) => agent.accountId === seller.id);
  assert.ok(linked); assert.equal(linked.name, seller.name);
  assert.ok(!(await call('/api/agents', b.token)).agents.some((agent: { id: number }) => agent.id === linked.id));
  await call('/api/auth/users', login.token, 'POST', { username: 'forbidden_user', name: 'Intruso', password: 'test-only-12345' }, 403);
  await call('/api/agents', login.token, 'POST', { name: 'Intruso' }, 403);
  await call('/api/auth/users', a.token, 'POST', { username: 'seat_over_limit', name: 'Extra', password: 'test-only-12345' }, 403);
  const [count] = await db.query<any[]>('SELECT COUNT(*) AS count FROM users WHERE business_id=?', [a.user.businessId]); assert.equal(count[0].count, 2);
  const items = [{ description: 'Producto de prueba', quantity: 2, unitPrice: 20 }];
  const sale = (await call('/api/sales', login.token, 'POST', { items, agentId: linked.id, metodoPago: 'por_pagar' }, 201)).sale;
  assert.equal((await call('/api/sales/' + sale.id, a.token)).sale.sellerName, 'Agente creado');
  await call('/api/sales', b.token, 'POST', { items, agentId: linked.id, metodoPago: 'por_pagar' }, 404);
  const quote = (await call('/api/quotes', login.token, 'POST', { items }, 201)).quote;
  assert.equal((await call('/api/quotes/' + quote.id, a.token)).quote.sellerName, 'Agente creado');
  await call('/api/quotes/' + quote.id, b.token, 'GET', undefined, 404);
  await call('/api/agents/' + linked.id, a.token, 'DELETE', undefined, 409);
  assert.ok((await call('/api/auth/users', a.token)).users.every((user: { businessId: number }) => user.businessId === a.user.businessId));
});
