import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';

test('conexión Novaled: rutas aisladas, errores de validación y descarga del PDF oficial', async (t) => {
  const previousUrl = process.env.EXPO_PUBLIC_API_URL;
  const previousBackend = process.env.EXPO_PUBLIC_BACKEND;
  const requests: { path: string; auth: string | undefined; accept: string | undefined; body: unknown }[] = [];
  const pdf = Buffer.from('%PDF-1.7\nPDF oficial\n%%EOF');
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url!, auth: req.headers.authorization, accept: req.headers.accept, body: raw ? JSON.parse(raw) : null });
    if (req.method === 'GET' && req.url?.startsWith('/api/v1/lumis/ui/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ quotes: [{ id: 1203, number: 42 }], sales: [], products: [{ id: 1001 }], clients: [{ id: 1001 }], meta: { currentPage: 2, lastPage: 3, total: 101 } })); return;
    }
    if (req.url?.startsWith('/api/v1/lumis/sales/42/') && req.url.includes('/pdf')) {
      res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(pdf); return;
    }
    if (req.url === '/api/v1/lumis/sales' && req.method === 'POST') {
      res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: { id: 42,number: 9,total: 160,balance: 120 } })); return;
    }
    if (req.url?.startsWith('/api/v1/lumis/sales/42/') && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: { id: 42,number: 9,total: 160,balance: 100 } })); return;
    }
    if (req.url === '/api/v1/lumis/quotes/7/pdf') {
      res.writeHead(200, { 'Content-Type': 'application/pdf' }).end(pdf); return;
    }
    if (req.url === '/api/v1/lumis/quotes/8/pdf') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>Login</html>'); return;
    }
    if (req.url === '/api/v1/lumis/quotes/9/pdf') { res.writeHead(401).end(); return; }
    if (req.url === '/api/v1/lumis/quotes') {
      res.writeHead(422, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'Validation failed', errors: { sucursal_id: ['Elige una sucursal disponible.'] } })); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ user: { id: 1 }, data: [], meta: { current_page: 1, last_page: 1 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:' + address.port;
  process.env.EXPO_PUBLIC_BACKEND = 'novaled';
  const files = new Map<string, Buffer>();
  class NativeDirectory {
    uri: string;
    constructor(parent: NativeDirectory | string, name: string) { this.uri = (typeof parent === 'string' ? parent : parent.uri) + '/' + name; }
    get exists() { return false; }
    create() {} list() { return []; }
  }
  class NativeFile {
    uri: string;
    constructor(parent: NativeDirectory, name: string) { this.uri = parent.uri + '/' + name; }
    create() {} write(bytes: Uint8Array) { files.set(this.uri, Buffer.from(bytes)); }
    async base64() { return files.get(this.uri)!.toString('base64'); }
  }
  const mocks = globalThis as typeof globalThis & { __novaledPdfMocks?: unknown };
  mocks.__novaledPdfMocks = { File: NativeFile, Directory: NativeDirectory, Paths: { cache: 'file:///cache' } };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (['expo-file-system','expo-print'].includes(specifier)) return { url: 'novaled-test:' + specifier, shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === 'novaled-test:expo-file-system') return { format: 'module', shortCircuit: true, source: 'export const { File, Directory, Paths } = globalThis.__novaledPdfMocks;' };
      if (url === 'novaled-test:expo-print') return { format: 'module', shortCircuit: true, source: 'export function printToFileAsync() { throw Error("El PDF conectado debe venir de Novaled"); }' };
      return next(url, context);
    },
  });
  t.after(async () => {
    hooks.deregister(); delete mocks.__novaledPdfMocks;
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL; else process.env.EXPO_PUBLIC_API_URL = previousUrl;
    if (previousBackend === undefined) delete process.env.EXPO_PUBLIC_BACKEND; else process.env.EXPO_PUBLIC_BACKEND = previousBackend;
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  });
  const { api, ApiError } = await import('../../apps/mobile/src/lib/api');
  const { backendPath, STORAGE_NAMESPACE, isConnectedRoute } = await import('../../apps/mobile/src/lib/backend');
  const { novaled, decimalValue, validDate, addDays, newOperationUuid } = await import('../../apps/mobile/src/lib/novaled');
  const { downloadNovaledQuotePdf, downloadNovaledPdf } = await import('../../apps/mobile/src/lib/pdfFile');
  const { subscribeSessionExpiry } = await import('../../apps/mobile/src/lib/authEvents');
  await t.test('las listas restauradas envían búsqueda, página e identidad del cliente a Novaled', async () => {
    const quotes = await api.quotes('mobile-token', { search: '42', page: 2 });
    assert.equal(requests.at(-1)!.path, '/api/v1/lumis/ui/quotes?search=42&page=2');
    assert.equal(quotes.quotes[0].number, 42); assert.equal(quotes.meta?.lastPage, 3);
    await api.products('mobile-token', 'LED & negro', 2);
    const productsUrl = new URL(requests.at(-1)!.path, 'http://test');
    assert.equal(productsUrl.pathname, '/api/v1/lumis/ui/products');
    assert.equal(productsUrl.searchParams.get('search'), 'LED & negro'); assert.equal(productsUrl.searchParams.get('page'), '2');
    await api.clients('mobile-token', { id: 1001 });
    assert.equal(requests.at(-1)!.path, '/api/v1/lumis/ui/clients?id=1001');
    await api.clients('mobile-token', { search: 'Cliente', page: 3 });
    assert.equal(requests.at(-1)!.path, '/api/v1/lumis/ui/clients?search=Cliente&page=3');
    await api.sales('mobile-token', { search: '22', page: 2 });
    assert.equal(requests.at(-1)!.path, '/api/v1/lumis/ui/sales?search=22&page=2');
    assert.equal(requests.at(-1)!.auth, 'Bearer mobile-token');
  });
  await t.test('auth va al dominio conectado y ninguna función pendiente usa el backend anterior', async () => {
    assert.equal(backendPath('/api/auth/login'), '/api/v1/lumis/auth/login');
    assert.equal(backendPath('/api/sales', false), '/api/sales');
    assert.match(STORAGE_NAMESPACE, /^novaled_[a-zA-Z0-9._-]+$/);
    assert.equal(isConnectedRoute('/quotes/7/preview'), true);
    assert.equal(isConnectedRoute('/pos/7'), true);
    assert.equal(isConnectedRoute('/pos/7/item'), true);
    assert.equal(isConnectedRoute('/quotes/new/item'), true);
    assert.equal(isConnectedRoute('/quotes/new/add-item'), false);
    await api.login({ username: 'asesor', password: 'password' });
    await api.me('mobile-token');
    assert.equal(requests.at(-1)!.auth, 'Bearer mobile-token');
    await api.sales('mobile-token');
    assert.equal(requests.at(-1)!.path, '/api/v1/lumis/ui/sales');
    assert.equal(requests.at(-1)!.auth, 'Bearer mobile-token');
  });
  await t.test('catálogos conservan la búsqueda paginada y Laravel muestra el error concreto', async () => {
    await novaled.products('mobile-token', 'Aplique & LED', 2);
    assert.equal(requests.at(-1)!.path, '/api/v1/lumis/products?search=Aplique%20%26%20LED&page=2');
    await assert.rejects(() => novaled.create({} as never, 'mobile-token'),
      err => err instanceof ApiError && err.status === 422 && err.message === 'Elige una sucursal disponible.');
  });
  await t.test('el archivo descargado conserva los bytes del servidor y la autorización', async () => {
    const expired: string[] = [];
    const unsubscribe = subscribeSessionExpiry(value => { expired.push(value); });
    const result = await downloadNovaledQuotePdf(7, 'cotizacion-7-v2.pdf', 'mobile-token');
    assert.equal(result.base64, pdf.toString('base64'));
    assert.equal(requests.at(-1)!.auth, 'Bearer mobile-token');
    assert.equal(requests.at(-1)!.accept, 'application/pdf');
    assert.match(result.uri, /cotizacion-7-v2\.pdf$/);
    await assert.rejects(() => downloadNovaledQuotePdf(8, 'incorrecto.pdf', 'mobile-token'), /PDF válido/);
    await assert.rejects(() => downloadNovaledQuotePdf(9, 'sin-sesion.pdf', 'mobile-token'), /sesión ha vencido/);
    assert.deepEqual(expired, ['mobile-token']);
    unsubscribe();
    assert.equal(files.size, 1);
  });
  await t.test('cantidades y fechas rechazan valores que cambiarían el presupuesto', () => {
    assert.equal(decimalValue('1,25', 'Cantidad'), 1.25);
    for (const value of ['-2','1.234','1e3','NaN','']) assert.throws(() => decimalValue(value, 'Cantidad'));
    assert.throws(() => decimalValue('0', 'Cantidad', 0.01));
    assert.equal(validDate('2026-02-30'), false);
    assert.equal(validDate('2028-02-29'), true);
    assert.equal(addDays('2026-12-29', 10), '2027-01-08');
  });
  await t.test('ventas, cobros y entregas envían el contrato de Novaled con la misma sesión', async () => {
    const body = { solicitud_id: 'mobile-sale-request-0001', tipo_documento: 'nota_venta' as const, sucursal_id: 1, cliente_id: null, cliente_nombre: 'Cliente móvil', notas: '',
      politica_descuento_id: null, descuento_alcance: 'global' as const, descuento_global_porcentaje: 0, descuento_global_monto: 0, monto_pagado: 0, metodo_pago: 'efectivo' as const,
      items: [{ articulo_id: 7,nombre: 'Lámpara',cantidad: 2,precio_unitario_venta: 80,unidad_medida: 'Unidad',aplica_descuento: true,salidas_stock: [{ sub_ubicacion_id: 3,cantidad: 2 }] }] };
    const result = await novaled.createSale(body,'mobile-token');
    assert.equal(result.data.id,42);
    assert.equal(requests.at(-1)!.path,'/api/v1/lumis/sales'); assert.deepEqual(requests.at(-1)!.body,body);
    await novaled.stock('mobile-token',1,[7,8],12);
    assert.equal(requests.at(-1)!.path,'/api/v1/lumis/stock?branchId=1&productIds=7%2C8&quoteId=12');
    const payment = { monto: 20,metodo_pago: 'qr' as const,referencia_pago: 'QR-123',clave_operacion: newOperationUuid() };
    await novaled.pay(42,payment,'mobile-token');
    assert.equal(requests.at(-1)!.path,'/api/v1/lumis/sales/42/payments'); assert.deepEqual(requests.at(-1)!.body,payment);
    await novaled.prepareDelivery(42,'mobile-token');
    assert.equal(requests.at(-1)!.path,'/api/v1/lumis/sales/42/delivery-note');
    const delivery = { fecha_entrega: '2026-11-09',recibido_por: 'Ana',observaciones_entrega: '',incluye_firma_empresa: true,monto: 0,metodo_pago: null,referencia_pago: '',clave_operacion: newOperationUuid() };
    await novaled.deliver(42,delivery,'mobile-token');
    assert.equal(requests.at(-1)!.path,'/api/v1/lumis/sales/42/delivery'); assert.deepEqual(requests.at(-1)!.body,delivery);
    assert.equal(requests.at(-1)!.auth,'Bearer mobile-token');
  });
  await t.test('los PDF de venta, entrega y pago conservan los bytes oficiales y el nombre de firma', async () => {
    for (const kind of ['sale','delivery','payment-proof'] as const) {
      const result = await downloadNovaledPdf(kind,42,kind + '-9.pdf','mobile-token',kind === 'delivery' ? { mode: 'otro',name: 'Ana Pérez' } : undefined);
      assert.equal(result.base64,pdf.toString('base64')); assert.equal(requests.at(-1)!.auth,'Bearer mobile-token');
      assert.equal(requests.at(-1)!.path,'/api/v1/lumis/sales/42/' + (kind === 'sale' ? '' : kind + '/') + 'pdf' + (kind === 'delivery' ? '?firma_entrega=otro&nombre_entrega=Ana%20P%C3%A9rez' : ''));
    }
  });
});
