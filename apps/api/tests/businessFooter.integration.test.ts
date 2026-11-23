import test from 'node:test';
import assert from 'node:assert/strict';

test('company PDF footer preferences persist across sessions and remain isolated and admin-only', {
  skip: process.env.LUMIS_INTEGRATION_TEST !== '1', timeout: 120000,
}, async t => {
  await import('dotenv/config');
  const host = process.env.DB_HOST || 'localhost';
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), 'Only local MySQL');
  const database = 'lumis_footer_test_' + process.pid + '_' + Date.now();
  process.env.DB_NAME = database;
  process.env.JWT_SECRET = 'test-only-' + database;
  const { config } = await import('../src/config');
  const mysql = await import('mysql2/promise');
  const db = await mysql.createConnection({ host, port: config.db.port, user: config.db.user, password: config.db.password });
  let closeServer: (() => Promise<void>) | undefined, closePool: (() => Promise<void>) | undefined;
  t.after(async () => {
    await closeServer?.(); await closePool?.();
    assert.match(database, /^lumis_footer_test_\d+_\d+$/);
    await db.query('DROP DATABASE IF EXISTS ' + database); await db.end();
  });
  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations();
  const { pool } = await import('../src/db/pool'); closePool = () => pool.end();
  const { createApp } = await import('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closeServer = () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = async (path: string, token?: string, method = 'GET', body?: unknown, status = 200) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  };
  const signup = (username: string) => call('/api/auth/register', undefined, 'POST', { username, name: username, password: 'test-only-12345' }, 201);
  const a = await signup('footer_a'), b = await signup('footer_b');
  const keys = ['mostrar_facebook', 'mostrar_instagram', 'mostrar_tiktok', 'mostrar_linkedin', 'mostrar_website', 'mostrar_direccion'] as const;
  const defaults = (await call('/api/business', a.token)).business;
  for (const key of keys) assert.equal(defaults[key], true);
  const patch = { mostrar_facebook: false, mostrar_instagram: true, mostrar_tiktok: false, mostrar_linkedin: false, mostrar_website: false, mostrar_direccion: true };
  await call('/api/business', a.token, 'PUT', patch);
  const secondSession = await call('/api/auth/login', undefined, 'POST', { username: 'footer_a', password: 'test-only-12345' });
  const restored = (await call('/api/business', secondSession.token)).business;
  for (const key of keys) assert.equal(restored[key], patch[key]);
  await call('/api/business', a.token, 'PUT', { nombre: 'Empresa renombrada' });
  const renamed = (await call('/api/business', a.token)).business;
  for (const key of keys) assert.equal(renamed[key], patch[key]);
  await call('/api/business', a.token, 'PUT', { mostrar_facebook: 'false', mostrar_instagram: false }, 400);
  const unchanged = (await call('/api/business', a.token)).business;
  for (const key of keys) assert.equal(unchanged[key], patch[key]);
  const isolated = (await call('/api/business', b.token)).business;
  for (const key of keys) assert.equal(isolated[key], true);
  await call('/api/auth/users', a.token, 'POST', { username: 'footer_seller', name: 'Seller', password: 'test-only-12345' }, 201);
  const seller = await call('/api/auth/login', undefined, 'POST', { username: 'footer_seller', password: 'test-only-12345' });
  const sellerCompany = (await call('/api/business', seller.token)).business;
  for (const key of keys) assert.equal(sellerCompany[key], patch[key]);
  await call('/api/business', seller.token, 'PUT', { mostrar_facebook: true }, 403);
  assert.equal((await call('/api/business', a.token)).business.mostrar_facebook, false);
});
