import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

test('Lumis independiente conserva sus rutas, usuarios y envíos sin campos de Novaled', async t => {
  const requests: { path: string; auth?: string; body: unknown }[] = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url!, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ user: { id: 8 }, token: 'lumis-session', quote: { id: 11 }, sale: { id: 12 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  process.env.EXPO_PUBLIC_BACKEND = 'lumis'; process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:' + address.port;
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const { api } = await import('../../apps/mobile/src/lib/api');
  await api.login({ username: 'usuario-anterior', password: 'password' });
  assert.deepEqual(requests.at(-1), { path: '/api/auth/login', auth: undefined, body: { username: 'usuario-anterior', password: 'password' } });
  const quote = { clientId: null, branchId: 1, items: [{ description: 'Lámpara', quantity: 2, unit: 'Unidad', unitPrice: 10 }] };
  await api.createQuote(quote, 'lumis-session');
  assert.deepEqual(requests.at(-1), { path: '/api/quotes', auth: 'Bearer lumis-session', body: quote });
  const sale = { ...quote, metodoPago: 'por_pagar' as const };
  await api.createSale(sale, 'lumis-session');
  assert.deepEqual(requests.at(-1), { path: '/api/sales', auth: 'Bearer lumis-session', body: sale });
  await api.addSalePayment(12, { monto: 5, nota: 'Abono' }, 'lumis-session');
  assert.deepEqual(requests.at(-1), { path: '/api/sales/12/payments', auth: 'Bearer lumis-session', body: { monto: 5, nota: 'Abono' } });
  await api.quotes('lumis-session', { search: '42', page: 2 });
  assert.equal(requests.at(-1)!.path, '/api/quotes');
  await api.clients('lumis-session', { search: 'Cliente', page: 2, id: 1001 });
  assert.equal(requests.at(-1)!.path, '/api/clients');
  await api.products('lumis-session', undefined, 2);
  assert.equal(requests.at(-1)!.path, '/api/products');
  await api.sales('lumis-session', { page: 2 });
  assert.equal(requests.at(-1)!.path, '/api/sales');
});
