import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { RowDataPacket } from 'mysql2/promise';

test(
  'panel y licencias: autenticación independiente, cupos atómicos, renovación y consulta al vencer',
  {
    skip: process.env.LUMIS_INTEGRATION_TEST !== '1',
    timeout: 120000,
  },
  async (t) => {
    await import('dotenv/config');
    const host = process.env.DB_HOST || 'localhost';
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), 'Solo MySQL local');
    const database = 'lumis_test_' + process.pid + '_' + Date.now();
    const uploads = await fs.mkdtemp(path.join(os.tmpdir(), 'lumis-license-test-'));
    process.env.DB_NAME = database;
    process.env.JWT_SECRET = 'test-only-' + database;
    process.env.UPLOADS_DIR = uploads;
    process.env.ADMIN_ORIGIN = 'http://127.0.0.1:5173';
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_BOOTSTRAP_USERNAME = 'platform_owner';
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'test-platform-only-12345';
    const { config } = await import('../src/config');
    const mysql = await import('mysql2/promise');
    const db = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      multipleStatements: true,
    });
    let closeServer: (() => Promise<void>) | undefined,
      closePool: (() => Promise<void>) | undefined;
    t.after(async () => {
      await closeServer?.();
      await closePool?.();
      assert.match(database, /^lumis_test_\d+_\d+$/);
      await db.query('DROP DATABASE IF EXISTS ' + database);
      await db.end();
      assert.ok(
        path
          .resolve(uploads)
          .startsWith(path.resolve(os.tmpdir()) + path.sep + 'lumis-license-test-'),
      );
      await fs.rm(uploads, { recursive: true, force: true });
    });
    await db.query('CREATE DATABASE ' + database);
    await db.changeUser({ database });
    const { runMigrations } = await import('../src/db/migrate');
    await runMigrations();
    await runMigrations();
    const { pool } = await import('../src/db/pool');
    closePool = () => pool.end();
    const { bootstrapPlatformAdmin } = await import('../src/lib/platformAuth');
    await bootstrapPlatformAdmin();
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'changed-env-must-not-reset';
    await bootstrapPlatformAdmin();
    const { createApp } = await import('../src/app');
    const server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    closeServer = () =>
      new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
    type Auth = { token?: string; cookie?: string; origin?: string };
    const call = async (
      url: string,
      method = 'GET',
      body?: unknown,
      auth: Auth = {},
      expected = 200,
    ) => {
      const response = await fetch(base + url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(auth.token ? { Authorization: 'Bearer ' + auth.token } : {}),
          ...(auth.cookie ? { Cookie: auth.cookie } : {}),
          ...(auth.origin ? { Origin: auth.origin } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = response.status === 204 ? null : await response.json();
      assert.equal(response.status, expected, url + ' ' + JSON.stringify(data));
      return { data, response };
    };
    const signup = async (username: string) =>
      (
        await call(
          '/api/auth/register',
          'POST',
          { username, name: username, password: 'tenant-test-12345' },
          {},
          201,
        )
      ).data;
    const a = await signup('license_company_a'),
      b = await signup('license_company_b');
    const tenant = { token: a.token };
    const id = a.user.businessId;
    await call('/api/platform/overview', 'GET', undefined, tenant, 401);
    await call(
      '/api/platform/login',
      'POST',
      { username: 'platform_owner', password: 'test-platform-only-12345' },
      {},
      403,
    );
    await call(
      '/api/platform/login',
      'POST',
      { username: 'platform_owner', password: 'bad' },
      { origin: process.env.ADMIN_ORIGIN },
      401,
    );
    const login = await call(
      '/api/platform/login',
      'POST',
      { username: 'platform_owner', password: 'test-platform-only-12345' },
      { origin: process.env.ADMIN_ORIGIN },
    );
    const setCookie = login.response.headers.get('set-cookie')!;
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.doesNotMatch(setCookie, /Domain=/i);
    const platform = { cookie: setCookie.split(';')[0], origin: process.env.ADMIN_ORIGIN };
    await call('/api/auth/me', 'GET', undefined, platform, 401);
    const [sessions] = await db.query<RowDataPacket[]>('SELECT token_hash FROM platform_sessions');
    assert.ok(!platform.cookie.includes(sessions[0].token_hash));
    const info = await call('/api/license', 'GET', undefined, tenant);
    assert.equal(info.data.license.plan, 'free');
    assert.equal(info.data.license.users.limit, 2);
    await call('/api/business', 'PUT', { nombre: 'Empresa A' }, tenant);
    await call('/api/business', 'PUT', { color_primario: '#123456' }, tenant, 403);
    await call(
      '/api/auth/users',
      'POST',
      { username: 'license_seller', name: 'Vendedor', password: 'seller-test-12345' },
      tenant,
      201,
    );
    await call(
      '/api/auth/users',
      'POST',
      { username: 'license_extra', name: 'Extra', password: 'seller-test-12345' },
      tenant,
      403,
    );
    const items = [{ description: 'Producto', quantity: 1, unit: 'Unidad', unitPrice: 10 }];
    // Seis solicitudes simultáneas: exactamente cinco deben confirmar la transacción.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        fetch(base + '/api/quotes', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + a.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 201).length, 5);
    assert.equal(results.filter((r) => r.status === 403).length, 1);
    const created = await Promise.all(results.filter((r) => r.status === 201).map((r) => r.json()));
    const quoteId = created[0].quote.id;
    await call('/api/quotes/' + quoteId, 'PATCH', { notes: 'No incluido' }, tenant, 403);
    await call('/api/quotes/%30' + quoteId, 'PATCH', { notes: 'No incluido' }, tenant, 403);
    await call('/api/QUOTES/' + quoteId, 'PATCH', { notes: 'No incluido' }, tenant, 403);
    await call('/api/quotes/' + quoteId + '/items/reorder', 'POST', { itemIds: [1] }, tenant, 403);
    await call('/api/quotes/' + quoteId + '/duplicate', 'POST', {}, tenant, 403);
    await call('/api/quotes/' + quoteId, 'PATCH', { includeSeal: false }, tenant);
    const paid = {
      plan: 'pro',
      status: 'active',
      expiresOn: '2030-01-31',
      note: 'Activación verificada',
    };
    await call(
      '/api/platform/businesses/' + id + '/license',
      'PUT',
      paid,
      { ...platform, origin: 'https://evil.invalid' },
      403,
    );
    await call('/api/platform/businesses/' + id + '/license', 'PUT', paid, platform);
    // Pro admite seis cuentas; una séptima requiere Plus y al bajar de plan queda en consulta.
    for (let n = 0; n < 4; n++)
      await db.query(
        "INSERT INTO users(username,name,password_hash,business_id,role) SELECT ?,?,password_hash,business_id,'seller' FROM users WHERE id=?",
        ['seat_test_' + n, 'Cupo ' + n, a.user.id],
      );
    await call(
      '/api/auth/users',
      'POST',
      { username: 'seat_seven', name: 'Séptimo', password: 'seat-test-12345' },
      tenant,
      403,
    );
    await call(
      '/api/platform/businesses/' + id + '/license',
      'PUT',
      { ...paid, plan: 'plus' },
      platform,
    );
    await call(
      '/api/auth/users',
      'POST',
      { username: 'seat_seven', name: 'Séptimo', password: 'seat-test-12345' },
      tenant,
      201,
    );
    const seventh = (
      await call('/api/auth/login', 'POST', { username: 'seat_seven', password: 'seat-test-12345' })
    ).data;
    await call('/api/platform/businesses/' + id + '/license', 'PUT', paid, platform);
    assert.equal(
      (await call('/api/license', 'GET', undefined, { token: seventh.token })).data.license.hasSeat,
      false,
    );
    await call(
      '/api/products',
      'POST',
      { name: 'Sin cupo', price: 1, unit: 'Unidad' },
      { token: seventh.token },
      403,
    );
    const [extraUsers] = await db.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE business_id=? AND (username LIKE 'seat_test_%' OR username='seat_seven')",
      [id],
    );
    for (const u of extraUsers)
      await call(
        '/api/platform/businesses/' + id + '/users/' + u.id,
        'PATCH',
        { enabled: false },
        platform,
      );
    await call('/api/business', 'PUT', { color_primario: '#123456' }, tenant);
    await call('/api/quotes/' + quoteId, 'PATCH', { notes: 'Edición Pro' }, tenant);
    await call('/api/quotes/' + created[1].quote.id, 'DELETE', undefined, tenant, 204);
    await call(
      '/api/platform/businesses/' + id + '/license',
      'PUT',
      { ...paid, plan: 'free', expiresOn: null },
      platform,
    );
    assert.equal(
      (await call('/api/license', 'GET', undefined, tenant)).data.license.quotas.quotes.used,
      5,
      'Borrar y bajar de plan no reinicia cupo',
    );
    await call('/api/quotes', 'POST', { items }, tenant, 403);
    const sales = [];
    for (let n = 0; n < 5; n++)
      sales.push(
        (await call('/api/sales', 'POST', { items, metodoPago: 'por_pagar' }, tenant, 201)).data
          .sale,
      );
    await call('/api/sales', 'POST', { items }, tenant, 403);
    for (const sale of sales) await call('/api/sales/' + sale.id + '/deliver', 'POST', {}, tenant);
    await call('/api/sales/' + sales[0].id + '/deliver', 'POST', {}, tenant);
    assert.equal(
      (await call('/api/license', 'GET', undefined, tenant)).data.license.quotas.deliveries.used,
      5,
      'Entrega idempotente',
    );
    await call('/api/sales/' + sales[0].id + '/payments', 'POST', { monto: 5 }, tenant, 201);
    await call('/api/platform/businesses/' + id + '/license', 'PUT', paid, platform);
    const extra = (await call('/api/sales', 'POST', { items }, tenant, 201)).data.sale;
    await call(
      '/api/platform/businesses/' + id + '/license',
      'PUT',
      { ...paid, plan: 'free', expiresOn: null },
      platform,
    );
    await call('/api/sales/' + extra.id + '/deliver', 'POST', {}, tenant, 403);
    await call(
      '/api/platform/businesses/' + id + '/license',
      'PUT',
      { ...paid, expiresOn: '2020-01-01' },
      platform,
    );
    assert.equal(
      (await call('/api/license', 'GET', undefined, tenant)).data.license.state,
      'expired',
    );
    await call('/api/auth/me', 'GET', undefined, tenant);
    await call('/api/quotes/' + quoteId, 'GET', undefined, tenant);
    await call('/api/sales/' + extra.id, 'GET', undefined, tenant);
    await call('/api/auth/preferences', 'PATCH', { themeMode: 'dark' }, tenant);
    await call(
      '/api/products',
      'POST',
      { name: 'No permitido', price: 1, unit: 'Unidad' },
      tenant,
      403,
    );
    await call('/api/sales/' + extra.id + '/payments', 'POST', { monto: 1 }, tenant, 403);
    await call(
      '/api/platform/businesses/' + id + '/license',
      'PUT',
      { ...paid, status: 'suspended' },
      platform,
    );
    await call('/api/quotes', 'POST', { items }, tenant, 403);
    assert.equal(
      (await call('/api/license', 'GET', undefined, { token: b.token })).data.license.state,
      'active',
      'Otra empresa conserva su licencia',
    );
    await call('/api/platform/businesses/' + id + '/license', 'PUT', paid, platform);
    const seller = (await call('/api/auth/users', 'GET', undefined, tenant)).data.users.find(
      (u: { role: string }) => u.role === 'seller',
    );
    const sellerSession = (
      await call('/api/auth/login', 'POST', {
        username: 'license_seller',
        password: 'seller-test-12345',
      })
    ).data;
    await call(
      '/api/platform/businesses/' + id + '/users/' + a.user.id,
      'PATCH',
      { enabled: false },
      platform,
      400,
    );
    await call(
      '/api/platform/businesses/' + b.user.businessId + '/users/' + seller.id,
      'PATCH',
      { enabled: false },
      platform,
      404,
    );
    await call(
      '/api/platform/businesses/' + id + '/users/' + seller.id,
      'PATCH',
      { enabled: false },
      platform,
    );
    await call(
      '/api/auth/login',
      'POST',
      { username: 'license_seller', password: 'seller-test-12345' },
      {},
      401,
    );
    await call('/api/auth/me', 'GET', undefined, { token: sellerSession.token }, 401);
    await call(
      '/api/platform/businesses/' + id + '/users/' + seller.id,
      'PATCH',
      { enabled: true },
      platform,
    );
    const history = (
      await call('/api/platform/activity?businessId=' + id, 'GET', undefined, platform)
    ).data.events;
    assert.ok(history.length >= 9);
    assert.equal(history[0].actor, 'Administrador Lumis');
    assert.ok(
      Math.abs(Date.now() - Date.parse(history[0].createdAt)) < 60000,
      'El historial conserva el instante real con MySQL en otra zona horaria',
    );
    assert.equal(
      (await call('/api/platform/businesses?search=license_company_b', 'GET', undefined, platform))
        .data.total,
      1,
    );
    const overview = (await call('/api/platform/overview', 'GET', undefined, platform)).data
      .overview;
    assert.equal(overview.paidCompanies, 1);
    assert.equal(overview.monthlyLicenseValue, 95);
    // Más solicitudes que conexiones del pool: guardar no debe retener una
    // conexión mientras espera otra para construir su respuesta.
    await Promise.all(
      Array.from({ length: 12 }, () =>
        call(
          '/api/platform/businesses/' + b.user.businessId + '/license',
          'PUT',
          { plan: 'free', status: 'active', expiresOn: null, note: 'Prueba concurrente del panel' },
          platform,
        ),
      ),
    );
    await call('/api/platform/logout', 'POST', {}, platform);
    await call('/api/platform/overview', 'GET', undefined, platform, 401);
    const again = await call(
      '/api/platform/login',
      'POST',
      { username: 'platform_owner', password: 'test-platform-only-12345' },
      { origin: process.env.ADMIN_ORIGIN },
    );
    const session = {
      ...platform,
      cookie: again.response.headers.get('set-cookie')!.split(';')[0],
    };
    await call(
      '/api/platform/password',
      'POST',
      { currentPassword: 'incorrecta', password: 'changed-test-password-12345' },
      session,
      400,
    );
    await call('/api/platform/me', 'GET', undefined, session);
    await call(
      '/api/platform/password',
      'POST',
      { currentPassword: 'test-platform-only-12345', password: 'changed-test-password-12345' },
      session,
    );
    await call('/api/platform/me', 'GET', undefined, session, 401);
    for (let i = 0; i < 10; i++)
      await call(
        '/api/platform/login',
        'POST',
        { username: 'unknown_login_test', password: 'bad' },
        { origin: process.env.ADMIN_ORIGIN },
        401,
      );
    await call(
      '/api/platform/login',
      'POST',
      { username: 'unknown_login_test', password: 'bad' },
      { origin: process.env.ADMIN_ORIGIN },
      429,
    );
  },
);
