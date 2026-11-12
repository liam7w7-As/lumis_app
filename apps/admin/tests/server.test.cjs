const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createServer } = require('../dist/server-app.cjs');
test('servidor de producción: SPA, archivos y proxy restringido con cookies', async (t) => {
  let received;
  const upstream = http.createServer((req, res) => {
    received = {
      url: req.url,
      origin: req.headers.origin,
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Set-Cookie', 'lumis_admin=test; HttpOnly; SameSite=Strict; Path=/');
    res.end('{"ok":true}');
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const server = createServer({
    root: path.join(__dirname, '../dist/public'),
    apiUrl: 'http://127.0.0.1:' + upstream.address().port,
    origin: 'https://admin.example.test',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const html = await fetch(base + '/companies');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Lumis/);
  assert.match(html.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(base + '/missing.js')).status, 404);
  assert.equal((await fetch(base + '/api/auth/me')).status, 404);
  assert.equal(
    (
      await fetch(base + '/api/platform/login', {
        method: 'POST',
        headers: { Origin: 'https://evil.test' },
      })
    ).status,
    403,
  );
  const response = await fetch(base + '/api/platform/login', {
    method: 'POST',
    headers: {
      Origin: 'https://admin.example.test',
      Cookie: 'lumis_admin=secret',
      'Content-Type': 'application/json',
      Authorization: 'Bearer not-forwarded',
    },
    body: '{}',
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.deepEqual(received, {
    url: '/api/platform/login',
    origin: 'https://admin.example.test',
    cookie: 'lumis_admin=secret',
    authorization: undefined,
  });
  const asset = await fetch(base + '/brand/lumis-logo.png', { method: 'HEAD' });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-type'), 'image/png');
  assert.throws(() => createServer({ apiUrl: 'http://insecure.example.test' }), /HTTPS/);
});
