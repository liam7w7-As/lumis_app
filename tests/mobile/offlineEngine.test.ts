import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createOfflineEngine } from '../../apps/mobile/src/offline/engine';
import { allocate } from '../../apps/mobile/src/offline/model';
import { clientSearchKey, matchingClients } from '../../apps/mobile/src/lib/clientSuggestions';
import { clone, emptyState, type Data, type Reply, type Request, type Store } from '../../apps/mobile/src/offline/types';

const user = { id: 7, businessId: 12, name: 'Agente local', role: 'admin', permissions: { viewQuotes: true, createQuotes: true, viewSales: true, createSales: true, takePayments: true, manualEntry: true } };
const license = { plan: 'pro', planName: 'Pro', state: 'active', readOnly: false, hasSeat: true, expiresOn: null,
  quotas: Object.fromEntries(['quotes', 'sales', 'deliveries', 'scans'].map(key => [key, { used: 0, remaining: null, limit: null }])), features: { editDocuments: true, brandColors: true } };
const business = { id: 12, nombre: 'Empresa local', terminos_default: 'Vigencia 10 días', color_primario: '#5842f4' };
const issue = (status: number, code: string) => Object.assign(new Error(code), { status, code });
const version = (data: Data) => createHash('sha256').update(JSON.stringify(data)).digest('hex');

// Exercise the production SQLite store through the same async surface provided
// by Expo. Transactions and persisted bytes are real SQLite, not an in-memory
// mock of save/load. Closing and opening a new connection simulates process loss.
async function sqliteFixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lumis-offline-engine-'));
  const filename = path.join(root, 'offline.sqlite');
  const connections: DatabaseSync[] = [];
  let failWrite = false;
  t.after(() => {
    connections.forEach(db => { try { db.close(); } catch {} });
    assert.equal(path.dirname(root), os.tmpdir()); assert.match(path.basename(root), /^lumis-offline-engine-/);
    rmSync(root, { recursive: true, force: true });
  });
  async function open(): Promise<Store> {
    const db = new DatabaseSync(filename); connections.push(db);
    const native = {
      async execAsync(sql: string) { db.exec(sql); },
      async getAllAsync(sql: string, ...args: any[]) { return db.prepare(sql).all(...args); },
      async withExclusiveTransactionAsync(fn: (tx: any) => Promise<void>) {
        db.exec('BEGIN IMMEDIATE');
        try {
          await fn({ async runAsync(sql: string, ...args: any[]) { const result = db.prepare(sql).run(...args); if (failWrite) { failWrite = false; throw Error('DISK_FULL'); } return result; } });
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    };
    const source = readFileSync(new URL('../../apps/mobile/src/offline/sqliteStore.ts', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports: any = {};
    runInNewContext(outputText, { exports, require(key: string) { if (key === 'expo-sqlite') return { openDatabaseAsync: async () => native }; if (key === './types') return { clone }; throw Error(key); } });
    return exports.openOfflineStore();
  }
  return { open, failNextWrite() { failWrite = true; }, close() { connections.forEach(db => { try { db.close(); } catch {} }); } };
}

function backend() {
  const records: Record<string, Record<number, Data>> = Object.fromEntries(['clients', 'products', 'quotes', 'sales', 'branches', 'agents'].map(kind => [kind, {}]));
  const calls: { path: string; options: Request }[] = [];
  const receipts = new Map<string, Reply>();
  let sequence = 100, fail: ((path: string, options: Request, result?: Reply) => boolean) | null = null;
  const singular: Record<string, string> = { clients: 'client', products: 'product', quotes: 'quote', sales: 'sale', branches: 'branch', agents: 'agent' };
  const send = async (raw: string, options: Request = {}): Promise<Reply> => {
    calls.push({ path: raw, options: clone(options) });
    if (fail?.(raw, options)) throw issue(0, 'NETWORK_ERROR');
    const url = new URL(raw, 'https://api.invalid'), method = options.method ?? 'GET', route = url.pathname;
    if (method === 'GET') {
      const values: Record<string, any> = { '/api/auth/me': { user }, '/api/business': { business }, '/api/license': { license }, '/api/tutorials': { progress: [] } };
      if (route in values) return { data: clone(values[route]), capability: true };
      const match = /^\/api\/(clients|products|quotes|sales|branches|agents)(?:\/(\d+))?$/.exec(route);
      assert.ok(match, 'Unexpected fixture read: ' + raw);
      const [, kind, id] = match;
      if (id) { const record = records[kind][Number(id)]; if (!record) throw issue(404, 'NOT_FOUND'); return { data: { [singular[kind]]: clone(record) }, version: version(record), capability: true }; }
      const rows = Object.values(records[kind]);
      return { data: { [kind]: clone(rows), meta: { currentPage: 1, lastPage: 1, total: rows.length } }, capability: true };
    }
    const operation = options.headers?.['X-Lumis-Operation-Id']; assert.ok(operation, 'Outbox must send an operation ID');
    const receipt = receipts.get(operation);
    if (receipt) return clone(receipt);
    const body = clone(options.body ?? {}) as Data; assert.ok(!('__localId' in body), 'Local-only bookkeeping must not enter the server payload');
    const match = /^\/api\/(clients|products|quotes|sales|branches|agents)(?:\/(\d+))?(.*)$/.exec(route);
    assert.ok(match, 'Unexpected fixture write: ' + raw);
    const [, kind, id, suffix] = match;
    let result: Reply;
    if (!id && method === 'POST') {
      let payload = body;
      if (suffix === '/from-quote') { assert.ok(records.quotes[body.quoteId], 'Converted quotation must already have its server ID'); payload = records.quotes[body.quoteId]; records.quotes[body.quoteId].status = 'convertida'; }
      const value: Data = { ...payload, id: ++sequence, createdAt: new Date().toISOString(), sellerName: user.name };
      if (kind === 'quotes' || kind === 'sales') {
        if (payload.clientId) assert.ok(records.clients[payload.clientId], 'Dependent client ID must be synchronized');
        if (payload.branchId) assert.ok(records.branches[payload.branchId], 'Dependent branch ID must be synchronized');
        if (payload.agentId) assert.ok(records.agents[payload.agentId], 'Dependent agent ID must be synchronized');
        value.items = payload.items.map((item: Data) => { if (item.productId) assert.ok(records.products[item.productId], 'Dependent product ID must be synchronized'); return { ...item, id: ++sequence, subtotal: item.quantity * item.unitPrice }; });
        Object.assign(value, { total: value.items.reduce((sum: number, item: Data) => sum + item.subtotal, 0), status: 'borrador', estado: 'activa', metodoPago: 'por_pagar', estadoPago: 'por_cobrar', totalPagado: 0, payments: [], includeSignature: false, includeSello: false, showNotes: false, clientName: payload.clientId ? records.clients[payload.clientId].name : null });
        if (kind === 'sales') {
          const paid = payload.metodoPago && payload.metodoPago !== 'por_pagar';
          const initial = paid ? value.total : payload.pagoInicial ?? 0;
          Object.assign(value, { metodoPago: payload.metodoPago ?? 'por_pagar', initialPayment: initial, totalPagado: initial, estadoPago: initial >= value.total ? 'pagado' : 'por_cobrar', payments: initial ? [{ id: ++sequence, monto: initial, nota: null, createdAt: value.createdAt }] : [] });
        }
      }
      records[kind][value.id] = value; result = { data: { [singular[kind]]: clone(value) }, version: version(value), capability: true };
    } else {
      const value = records[kind][Number(id)]; assert.ok(value, 'Dependent document must have a real server ID');
      const expected = options.headers?.['X-Lumis-Base-Version']; if (expected && expected !== version(value)) throw issue(409, 'OFFLINE_DOCUMENT_CONFLICT');
      let outgoing: Data = { ok: true };
      if (!suffix && method === 'DELETE') delete records[kind][Number(id)];
      else if (!suffix && method === 'PATCH') Object.assign(value, body);
      else if (suffix === '/payments' && method === 'POST') { const payment = { ...body, id: ++sequence, createdAt: new Date().toISOString() }; value.payments.push(payment); outgoing.payment = payment; }
      else if (suffix.startsWith('/payments/') && method === 'DELETE') { const paymentId = Number(suffix.split('/')[2]); assert.ok(value.payments.some((row: Data) => row.id === paymentId), 'Payment dependency must have a real server ID'); value.payments = value.payments.filter((row: Data) => row.id !== paymentId); }
      else if (suffix === '/items' && method === 'POST') { const item = { ...body, id: ++sequence, subtotal: body.quantity * body.unitPrice }; value.items.push(item); outgoing.item = item; }
      else if (/^\/items\/\d+\/duplicate$/.test(suffix) && method === 'POST') { const source = value.items.find((item: Data) => item.id === Number(suffix.split('/')[2])); assert.ok(source); const item = { ...source, id: ++sequence }; value.items.push(item); outgoing.item = item; }
      else if (suffix === '/items/reorder') { assert.deepEqual(new Set(body.itemIds), new Set(value.items.map((row: Data) => row.id))); value.items = body.itemIds.map((itemId: number) => value.items.find((row: Data) => row.id === itemId)); }
      else if (suffix.startsWith('/items/')) { const itemId = Number(suffix.split('/')[2]); const item = value.items.find((row: Data) => row.id === itemId); assert.ok(item, 'Dependent item must have a real server ID'); if (method === 'DELETE') value.items = value.items.filter((row: Data) => row.id !== itemId); else Object.assign(item, body); }
      else throw Error('Unhandled fixture mutation: ' + route);
      if (value.items) { value.items.forEach((item: Data) => { item.subtotal = item.quantity * item.unitPrice; }); value.total = value.items.reduce((sum: number, item: Data) => sum + item.subtotal, 0); }
      if (value.payments) { value.totalPagado = value.payments.reduce((sum: number, row: Data) => sum + row.monto, 0); value.estadoPago = value.totalPagado >= value.total ? 'pagado' : 'por_cobrar'; }
      result = { data: outgoing, version: version(value), capability: true };
    }
    receipts.set(operation, clone(result));
    if (fail?.(raw, options, result)) throw issue(0, 'NETWORK_ERROR');
    return clone(result);
  };
  return { send, records, calls, receipts, failWith(value: typeof fail) { fail = value; } };
}
async function session(store: Store, server: ReturnType<typeof backend>, scope = 'lumis/api/company12/user7', connected = false) {
  const app = createOfflineEngine({ store, scope, user: clone(user), connected, send: server.send });
  await app.initialize(); return app;
}
async function prime(store: Store, server: ReturnType<typeof backend>, scope?: string, connected = false) {
  const app = await session(store, server, scope, connected); await app.refresh(); assert.ok(app.status().readyAt); app.setOnline(false); return app;
}

for (const connected of [false, true]) {
  test(`${connected ? 'Novaled' : 'Lumis'}: real SQLite survives process restart and synchronizes client → product → quote → sale dependencies`, async t => {
    const disk = await sqliteFixture(t); const server = backend(); const scope = connected ? 'novaled/api/company12/user7' : undefined;
    let app = await prime(await disk.open(), server, scope, connected);
    const client = (await app.request('/api/clients', { method: 'POST', body: { name: 'Cliente sin datos' } })).client;
    const product = (await app.request('/api/products', { method: 'POST', body: { name: 'Producto local', price: 20, unit: 'Unidad', marca: 'Marca local' } })).product;
    const quote = (await app.request('/api/quotes', { method: 'POST', body: { clientId: client.id, items: [{ productId: product.id, description: product.name, quantity: 3, unitPrice: 20, unit: 'Unidad' }] } })).quote;
    const sale = (await app.request('/api/sales', { method: 'POST', body: { clientId: client.id, metodoPago: 'por_pagar', items: [{ productId: product.id, description: product.name, quantity: 2, unitPrice: 20, unit: 'Unidad' }] } })).sale;
    assert.equal(quote.total, 60); assert.equal(sale.total, 40); assert.equal(app.queue().length, 4);
    const operationIds = app.queue().map(row => row.id); app.stop(); disk.close();
    app = await session(await disk.open(), server, scope, connected); app.setOnline(false);
    assert.deepEqual(app.queue().map(row => row.id), operationIds);
    assert.equal((await app.request('/api/quotes/' + quote.id)).quote.items[0].description, product.name);
    assert.equal((await app.request('/api/sales/' + sale.id)).sale.clientId, client.id);
    assert.equal((await app.request('/api/clients')).clients.length, 1);
    app.setOnline(true); await app.synchronize();
    assert.deepEqual(app.queue(), []); assert.equal(Object.keys(server.records.clients).length, 1); assert.equal(Object.keys(server.records.products).length, 1);
    const sentQuote = Object.values(server.records.quotes)[0]; assert.ok(sentQuote.clientId < 1e12); assert.ok(sentQuote.items[0].productId < 1e12);
    assert.equal((await app.request('/api/quotes/' + quote.id)).quote.id, quote.id, 'Existing navigation IDs must survive synchronization');
    app.stop();
  });
}

test('a lost acknowledgement survives restart and reuses the same operation ID without duplicating a client', async t => {
  const disk = await sqliteFixture(t), server = backend(); let app = await prime(await disk.open(), server);
  const created = (await app.request('/api/clients', { method: 'POST', body: { name: 'Respuesta perdida' } })).client;
  const operation = app.queue()[0].id;
  server.failWith((_path, options, result) => options.method === 'POST' && !!result);
  app.setOnline(true); await app.synchronize();
  assert.equal(app.queue()[0].id, operation); assert.equal(Object.keys(server.records.clients).length, 1);
  app.stop(); disk.close(); server.failWith(null);
  app = await session(await disk.open(), server); app.setOnline(true); await app.synchronize();
  assert.deepEqual(app.queue(), []); assert.equal(Object.keys(server.records.clients).length, 1);
  assert.equal((await app.request('/api/clients')).clients[0].id, created.id); app.stop();
});

test('local commit failure rolls back both visible records and outbox in real SQLite', async t => {
  const disk = await sqliteFixture(t), server = backend(), store = await disk.open(), app = await prime(store, server);
  const before = app.state(); disk.failNextWrite();
  await assert.rejects(app.request('/api/clients', { method: 'POST', body: { name: 'No se debe perder' } }), /DISK_FULL/);
  assert.deepEqual(app.state(), before); assert.deepEqual(clone(await store.load('lumis/api/company12/user7')), before); app.stop();
});

test('company/user/API scopes never expose another account records or outgoing operations', async t => {
  const disk = await sqliteFixture(t), server = backend(), store = await disk.open();
  const a = await prime(store, server, 'lumis/api/company12/user7');
  await a.request('/api/clients', { method: 'POST', body: { name: 'Privado de A' } }); a.stop();
  for (const scope of ['lumis/api/company12/user8', 'lumis/api/company13/user7', 'novaled/api/company12/user7', 'lumis/another-api/company12/user7']) {
    const b = await session(await disk.open(), server, scope); b.setOnline(false);
    assert.deepEqual(b.queue(), []); assert.deepEqual((await b.request('/api/clients')).clients, []); b.stop();
  }
});

test('an offline saved document keeps inline edits, deletes and product order after restarting', async t => {
  const disk = await sqliteFixture(t), server = backend(); let app = await prime(await disk.open(), server);
  const quote = (await app.request('/api/quotes', { method: 'POST', body: { items: ['Uno', 'Dos', 'Tres'].map(description => ({ description, quantity: 1, unitPrice: 10, unit: 'Unidad' })) } })).quote;
  const [one, two, three] = quote.items;
  await app.request(`/api/quotes/${quote.id}/items/${one.id}`, { method: 'PATCH', body: { description: 'Nombre editado', quantity: 2, unitPrice: 15, marca: 'M', procedencia: 'Bolivia' } });
  await app.request(`/api/quotes/${quote.id}/items/${two.id}`, { method: 'DELETE' });
  await app.request(`/api/quotes/${quote.id}/items/reorder`, { method: 'POST', body: { itemIds: [three.id, one.id] } });
  app.stop(); disk.close(); app = await session(await disk.open(), server); app.setOnline(false);
  const restored = (await app.request(`/api/quotes/${quote.id}`)).quote;
  assert.deepEqual(restored.items.map((it: Data) => it.id), [three.id, one.id]); assert.equal(restored.total, 40);
  assert.equal(restored.items[1].marca, 'M'); assert.equal(restored.items[1].procedencia, 'Bolivia'); app.stop();
});

test('another device changing a saved document blocks replay instead of overwriting its changes', async t => {
  const disk = await sqliteFixture(t), server = backend();
  server.records.quotes[5] = { id: 5, status: 'borrador', notes: 'Original', createdAt: new Date().toISOString(), items: [{ id: 6, description: 'Artículo', quantity: 1, unitPrice: 10, subtotal: 10 }], total: 10 };
  const app = await prime(await disk.open(), server);
  await app.request('/api/quotes/5', { method: 'PATCH', body: { notes: 'Desde el teléfono offline' } });
  server.records.quotes[5].notes = 'Cambio de otro equipo';
  app.setOnline(true); await app.synchronize();
  assert.equal(app.queue().length, 1); assert.equal(app.queue()[0].code, 'OFFLINE_DOCUMENT_CONFLICT');
  assert.equal(server.records.quotes[5].notes, 'Cambio de otro equipo');
  assert.equal((await app.request('/api/quotes/5')).quote.notes, 'Desde el teléfono offline'); app.stop();
});

test('magic scanning cannot be queued without internet', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  await assert.rejects(app.request('/api/quotes/scan', { method: 'POST', body: { base64: 'image' } }), /necesita conexión/);
  assert.deepEqual(app.queue(), []); app.stop();
});

for (const connected of [false, true]) test(`${connected ? 'Novaled' : 'Lumis'} busca clientes remotos, conserva los locales pendientes y permite reutilizarlos offline`, async t => {
  const disk = await sqliteFixture(t), server = backend();
  for (let id = 1; id <= 215; id++) server.records.clients[id] = { id, name: `Cliente ${String(id).padStart(3, '0')}`, phone: null, email: null };
  server.records.clients[215].name = 'UMSA Universidad';
  server.records.clients[216] = { id: 216, name: 'Álvaro Ñúñez', phone: null, email: null };
  const pages: string[] = [];
  let offline = false;
  const send = async (path: string, options: Request = {}): Promise<Reply> => {
    const url = new URL(path, 'https://api.invalid');
    if (url.pathname !== '/api/clients' || (options.method && options.method !== 'GET')) return server.send(path, options);
    if (offline) throw issue(0, 'NETWORK_ERROR');
    pages.push(path);
    const query = url.searchParams.get('search');
    const all = Object.values(server.records.clients);
    const data = query ? matchingClients(all as (Data & { id: number; name: string })[], query, Infinity) : all;
    const page = Number(url.searchParams.get('page') ?? 1);
    return { data: { clients: clone(data.slice((page - 1) * 50, page * 50)), meta: { currentPage: page, total: data.length, lastPage: Math.max(1, Math.ceil(data.length / 50)) } }, capability: true };
  };
  const scope = `${connected ? 'novaled' : 'lumis'}/api/clients-search/user7`;
  const open = async () => {
    const engine = createOfflineEngine({ store: await disk.open(), scope, user: clone(user), connected, send });
    await engine.initialize(); return engine;
  };
  let app = await open(); await app.refresh();
  assert.ok(pages.includes('/api/clients?page=5'), 'Lumis también sincroniza los clientes posteriores a los primeros 200');
  app.setOnline(false);
  const pendingClient = (await app.request('/api/clients', { method: 'POST', body: { name: 'UMSA Local' } })).client;
  app.stop(); disk.close();
  server.records.clients[217] = { id: 217, name: 'UMSA Nueva', phone: '70000000', email: null };
  app = await open();
  const found = await app.request('/api/clients?search=umsa&page=1');
  assert.deepEqual(found.clients.map((client: Data) => client.name).sort(), ['UMSA Local', 'UMSA Nueva', 'UMSA Universidad']);
  assert.equal(found.clients.find((client: Data) => client.name === 'UMSA Local').id, pendingClient.id);
  assert.equal(app.queue().length, 1, 'La búsqueda no crea otro cliente ni consume su operación pendiente');
  const accented = await app.request('/api/clients?search=ALVARO%20NUNEZ&page=1');
  assert.equal(accented.clients[0].name, 'Álvaro Ñúñez');
  assert.equal(clientSearchKey(accented.clients[0].name), 'alvaro nunez');
  offline = true;
  const fallback = await app.request('/api/clients?search=UMSA&page=1');
  assert.equal(fallback.clients.length, 3, 'Una caída de red conserva las sugerencias descargadas y el cliente local');
  app.stop(); disk.close(); app = await open(); app.setOnline(false);
  const retained = await app.request('/api/clients?search=UMSA&page=1');
  assert.equal(retained.clients.find((client: Data) => client.id === 217).phone, '70000000');
  const quote = (await app.request('/api/quotes', { method: 'POST', body: { clientId: 217,
    items: [{ description: 'Artículo', quantity: 1, unit: 'Unidad', unitPrice: 10 }] } })).quote;
  assert.equal(quote.clientId, 217);
  assert.equal(quote.clientName, 'UMSA Nueva');
  assert.equal(app.queue().filter(op => op.path === '/api/clients' && op.method === 'POST').length, 1);
  app.stop();
});

for (const connected of [false, true]) test(`${connected ? 'Novaled' : 'Lumis'} conserva y sincroniza una cotización escaneada incompleta con precio cero`, async t => {
  const disk = await sqliteFixture(t), server = backend();
  const scope = `${connected ? 'novaled' : 'lumis'}/api/company12/scan-empty`;
  let app = await prime(await disk.open(), server, scope, connected);
  const quote = (await app.request('/api/quotes', { method: 'POST', body: { items: [
    { fromScan: true, productId: null, description: '', quantity: 0, unit: '', unitPrice: 0, createProduct: false },
    { fromScan: true, productId: null, description: 'Leído', quantity: 2, unit: '', unitPrice: 0, createProduct: false },
  ] } })).quote;
  assert.equal(quote.total, 0);
  assert.equal(quote.items[0].description, '');
  assert.equal(quote.items[0].quantity, 0);
  assert.equal(quote.items[0].unitPrice, 0);
  await app.request(`/api/quotes/${quote.id}/items/${quote.items[0].id}`, { method: 'PATCH', body: { description: 'Revisado' } });
  app.stop(); disk.close();
  app = await session(await disk.open(), server, scope, connected); app.setOnline(false);
  const restored = (await app.request(`/api/quotes/${quote.id}`)).quote;
  assert.equal(restored.items[0].fromScan, true);
  assert.equal(restored.items[0].description, 'Revisado');
  assert.equal(restored.items[0].unit, '');
  assert.equal(restored.items[0].quantity, 0);
  assert.equal(restored.items[0].unitPrice, 0);
  await assert.rejects(app.request('/api/sales/from-quote', { method: 'POST', body: { quoteId: quote.id } }), /antes de convertir/);
  app.setOnline(true); await app.synchronize();
  assert.equal(app.queue().length, 0);
  const remote = Object.values(server.records.quotes)[0];
  assert.equal(remote.items[0].fromScan, true);
  assert.equal(remote.items[0].description, 'Revisado');
  assert.equal(remote.items[0].unit, '');
  assert.equal(remote.items[0].quantity, 0);
  assert.equal(remote.items[0].unitPrice, 0);
  app.stop();
});

test('acknowledged document creation survives a lost detail read before mapping dependent item edits', async t => {
  const disk = await sqliteFixture(t), server = backend(); let app = await prime(await disk.open(), server);
  const quote = (await app.request('/api/quotes', { method: 'POST', body: { items: [{ description: 'Original', quantity: 1, unitPrice: 10, unit: 'Unidad' }] } })).quote;
  const lineId = quote.items[0].id;
  await app.request(`/api/quotes/${quote.id}/items/${lineId}`, { method: 'PATCH', body: { description: 'Nombre final', quantity: 2 } });
  const createOperation = app.queue()[0].id;
  server.failWith((route, options) => /^\/api\/quotes\/\d+$/.test(route) && !options.method);
  app.setOnline(true); await app.synchronize();
  assert.equal(Object.keys(server.records.quotes).length, 1);
  assert.equal(app.queue()[0].id, createOperation, 'A receipt must remain durable until dependent item IDs are mapped');
  app.stop(); disk.close(); server.failWith(null);
  app = await session(await disk.open(), server); app.setOnline(true); await app.synchronize();
  assert.deepEqual(app.queue(), []); assert.equal(Object.keys(server.records.quotes).length, 1);
  const remote = Object.values(server.records.quotes)[0]; assert.equal(remote.items[0].description, 'Nombre final'); assert.equal(remote.items[0].quantity, 2);
  const local = (await app.request(`/api/quotes/${quote.id}`)).quote; assert.equal(local.items[0].id, lineId); app.stop();
});

test('server acceptance followed by a failed local acknowledgement commit replays the original operation safely', async t => {
  const disk = await sqliteFixture(t), server = backend(); let app = await prime(await disk.open(), server);
  await app.request('/api/clients', { method: 'POST', body: { name: 'Guardado antes del fallo del disco' } });
  const operation = app.queue()[0].id;
  server.failWith((_route, options, result) => { if (options.method === 'POST' && result) disk.failNextWrite(); return false; });
  app.setOnline(true); await app.synchronize();
  assert.equal(app.queue()[0].id, operation); assert.equal(Object.keys(server.records.clients).length, 1);
  app.stop(); disk.close(); server.failWith(null);
  app = await session(await disk.open(), server); app.setOnline(true); await app.synchronize();
  assert.deepEqual(app.queue(), []); assert.equal(Object.keys(server.records.clients).length, 1); app.stop();
});

test('duplicating and converting local documents creates independent identities and preserves the source', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const quote = (await app.request('/api/quotes', { method: 'POST', body: { items: [{ description: 'Original', quantity: 1, unitPrice: 10, unit: 'Unidad' }] } })).quote;
  const copy = (await app.request(`/api/quotes/${quote.id}/duplicate`, { method: 'POST' })).quote;
  assert.notEqual(copy.id, quote.id); assert.notEqual(copy.items[0].id, quote.items[0].id);
  assert.equal((await app.request(`/api/quotes/${copy.id}`)).quote.id, copy.id);
  const sale = (await app.request('/api/sales/from-quote', { method: 'POST', body: { quoteId: quote.id } })).sale;
  assert.notEqual(sale.id, quote.id); assert.notEqual(sale.id, copy.id);
  assert.equal((await app.request(`/api/sales/${sale.id}`)).sale.quoteId, quote.id);
  assert.equal((await app.request(`/api/quotes/${quote.id}`)).quote.status, 'convertida');
  assert.equal((await app.request(`/api/quotes/${copy.id}`)).quote.status, 'borrador'); app.stop();
});

test('a detail refresh between queued edits must not advance the baseline past another device edit', async t => {
  const disk = await sqliteFixture(t), server = backend();
  server.records.quotes[5] = { id: 5, status: 'borrador', notes: 'Original', createdAt: new Date().toISOString(), items: [{ id: 6, description: 'Artículo', quantity: 1, unitPrice: 10, subtotal: 10 }], total: 10 };
  const app = await prime(await disk.open(), server);
  await app.request('/api/quotes/5', { method: 'PATCH', body: { notes: 'Primer cambio offline' } });
  await app.request('/api/quotes/5', { method: 'PATCH', body: { notes: 'Segundo cambio offline' } });
  let changed = false;
  server.failWith((route, options) => {
    if (route === '/api/quotes/5' && !options.method && server.receipts.size && !changed) { changed = true; server.records.quotes[5].notes = 'Otro equipo entre los dos envíos'; }
    return false;
  });
  app.setOnline(true); await app.synchronize();
  assert.equal(app.queue().length, 1); assert.equal(app.queue()[0].code, 'OFFLINE_DOCUMENT_CONFLICT');
  assert.equal(server.records.quotes[5].notes, 'Otro equipo entre los dos envíos'); app.stop();
});

test('temporary IDs remain unique through bursts, process restarts and a backwards device clock', () => {
  const originalNow = Date.now;
  try {
    Date.now = () => 1800000000000;
    let state = emptyState(); const values = Array.from({ length: 1500 }, () => allocate(state));
    assert.equal(new Set(values).size, values.length);
    state = clone(state); Date.now = () => 1700000000000;
    const next = allocate(state); assert.ok(next > values.at(-1)!); assert.ok(Number.isSafeInteger(next));
  } finally { Date.now = originalNow; }
});

test('an older API without durable receipt support never receives queued writes', async t => {
  const disk = await sqliteFixture(t), server = backend();
  const oldServer = { ...server, send: async (route: string, options: Request = {}) => ({ ...await server.send(route, options), capability: false }) };
  const app = await prime(await disk.open(), oldServer);
  await app.request('/api/clients', { method: 'POST', body: { name: 'Debe quedar local' } });
  app.setOnline(true); await app.synchronize();
  assert.equal(app.queue().length, 1); assert.equal(Object.keys(server.records.clients).length, 0);
  assert.match(app.status().message ?? '', /API necesita/); app.stop();
});

test('offline branch and agent creations are mapped before the dependent sale is sent', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const branch = (await app.request('/api/branches', { method: 'POST', body: { name: 'Sucursal nueva' } })).branch;
  const agent = (await app.request('/api/agents', { method: 'POST', body: { name: 'Vendedor nuevo' } })).agent;
  const sale = (await app.request('/api/sales', { method: 'POST', body: { branchId: branch.id, agentId: agent.id, metodoPago: 'por_pagar', items: [{ description: 'Artículo', quantity: 1, unitPrice: 100 }] } })).sale;
  assert.equal(sale.branchName, branch.name); assert.equal(sale.sellerName, agent.name);
  app.setOnline(true); await app.synchronize();
  assert.deepEqual(app.queue(), []); const remote = Object.values(server.records.sales)[0];
  assert.ok(server.records.branches[remote.branchId]); assert.ok(server.records.agents[remote.agentId]); app.stop();
});

test('a queued local payment may be deleted before reconnecting without leaving a charge or duplicate', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const sale = (await app.request('/api/sales', { method: 'POST', body: { metodoPago: 'por_pagar', items: [{ description: 'Artículo', quantity: 1, unitPrice: 100 }] } })).sale;
  const payment = (await app.request(`/api/sales/${sale.id}/payments`, { method: 'POST', body: { monto: 40 } })).payment;
  await app.request(`/api/sales/${sale.id}/payments/${payment.id}`, { method: 'DELETE' });
  assert.equal((await app.request(`/api/sales/${sale.id}`)).sale.totalPagado, 0);
  app.setOnline(true); await app.synchronize();
  assert.deepEqual(app.queue(), []); const remote = Object.values(server.records.sales)[0]; assert.equal(remote.totalPagado, 0); assert.deepEqual(remote.payments, []); app.stop();
});

test('a local initial payment can be removed after sale creation is acknowledged', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const sale = (await app.request('/api/sales', { method: 'POST', body: { metodoPago: 'por_pagar', pagoInicial: 40, items: [{ description: 'Artículo', quantity: 1, unitPrice: 100 }] } })).sale;
  await app.request(`/api/sales/${sale.id}/payments/${sale.payments[0].id}`, { method: 'DELETE' });
  app.setOnline(true); await app.synchronize();
  assert.deepEqual(app.queue(), []); assert.equal(Object.values(server.records.sales)[0].totalPagado, 0); app.stop();
});

test('deleting a newly created local document completes without asking the server for its deleted detail', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const quote = (await app.request('/api/quotes', { method: 'POST', body: { items: [{ description: 'Temporal', quantity: 1, unitPrice: 10 }] } })).quote;
  await app.request(`/api/quotes/${quote.id}`, { method: 'DELETE' });
  app.setOnline(true); await app.synchronize();
  assert.deepEqual(app.queue(), []); assert.deepEqual(Object.keys(server.records.quotes), []);
  assert.deepEqual((await app.request('/api/quotes')).quotes, []); app.stop();
});

test('a paid sale duplicate starts with no previous payments and its own item identities', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const original = (await app.request('/api/sales', { method: 'POST', body: { metodoPago: 'efectivo', items: [{ description: 'Pagado', quantity: 1, unitPrice: 100 }] } })).sale;
  assert.equal(original.estadoPago, 'pagado'); assert.equal(original.totalPagado, 100);
  const duplicate = (await app.request(`/api/sales/${original.id}/duplicate`, { method: 'POST' })).sale;
  assert.notEqual(duplicate.id, original.id); assert.notEqual(duplicate.items[0].id, original.items[0].id);
  assert.equal(duplicate.initialPayment, 0); assert.equal(duplicate.totalPagado, 0); assert.deepEqual(duplicate.payments, []); assert.equal(duplicate.estadoPago, 'por_cobrar'); app.stop();
});

test('conversions count toward the remaining sales quota while working offline', async t => {
  const disk = await sqliteFixture(t), server = backend();
  const free = { ...clone(license), plan: 'free', planName: 'Gratis', features: { editDocuments: false, brandColors: false }, quotas: { ...license.quotas, sales: { used: 4, remaining: 1, limit: 5 } } };
  const restricted = { ...server, send: async (route: string, options: Request = {}) => route === '/api/license' ? { data: { license: free }, capability: true } : server.send(route, options) };
  const app = await prime(await disk.open(), restricted);
  const quotes = [];
  for (let i = 0; i < 2; i++) quotes.push((await app.request('/api/quotes', { method: 'POST', body: { items: [{ description: 'Artículo', quantity: 1, unitPrice: 10 }] } })).quote);
  await app.request('/api/sales/from-quote', { method: 'POST', body: { quoteId: quotes[0].id } });
  await assert.rejects(app.request('/api/sales/from-quote', { method: 'POST', body: { quoteId: quotes[1].id } }), /cupo/);
  assert.equal((await app.request('/api/sales')).sales.length, 1); app.stop();
});

test('free plan denies saved item edits locally but keeps allowed document options and payments', async t => {
  const disk = await sqliteFixture(t), server = backend();
  server.records.quotes[5] = { id: 5, status: 'borrador', notes: null, createdAt: new Date().toISOString(), items: [{ id: 6, description: 'Original', quantity: 1, unitPrice: 10, subtotal: 10 }], total: 10 };
  server.records.sales[8] = { id: 8, estado: 'activa', metodoPago: 'por_pagar', estadoPago: 'por_cobrar', createdAt: new Date().toISOString(), totalPagado: 0, payments: [], items: [{ id: 9, description: 'Original', quantity: 1, unitPrice: 100, subtotal: 100 }], total: 100 };
  const free = { ...clone(license), plan: 'free', planName: 'Gratis', features: { editDocuments: false, brandColors: false } };
  const restricted = { ...server, send: async (route: string, options: Request = {}) => route === '/api/license' ? { data: { license: free }, capability: true } : server.send(route, options) };
  const app = await prime(await disk.open(), restricted);
  await assert.rejects(app.request('/api/quotes/5/items/6', { method: 'PATCH', body: { description: 'No permitido' } }), /Pro|plan|edici/i);
  await app.request('/api/quotes/5', { method: 'PATCH', body: { includeSeal: true } });
  await app.request('/api/sales/8/payments', { method: 'POST', body: { monto: 20 } });
  assert.equal((await app.request('/api/quotes/5')).quote.includeSeal, true);
  assert.equal((await app.request('/api/sales/8')).sale.totalPagado, 20); app.stop();
});

test('a late server reply from a stopped session cannot overwrite another account and remains recoverable', async t => {
  const disk = await sqliteFixture(t), server = backend(), store = await disk.open();
  let proceed!: () => void, entered!: () => void;
  const barrier = new Promise<void>(resolve => { proceed = resolve; });
  const sent = new Promise<void>(resolve => { entered = resolve; });
  const delayed = { ...server, send: async (route: string, options: Request = {}) => { if (options.method === 'POST') { entered(); await barrier; } return server.send(route, options); } };
  const old = await prime(store, delayed, 'account-A');
  await old.request('/api/clients', { method: 'POST', body: { name: 'Cuenta anterior' } });
  const operation = old.queue()[0].id; old.setOnline(true); const flight = old.synchronize(); await sent; old.stop();
  const next = await prime(await disk.open(), server, 'account-B');
  await next.request('/api/clients', { method: 'POST', body: { name: 'Cuenta nueva' } });
  const nextBefore = next.state(); proceed(); await flight;
  assert.deepEqual(next.state(), nextBefore); assert.equal((await store.load('account-A'))?.queue[0].id, operation);
  next.stop(); const recovered = await session(await disk.open(), server, 'account-A'); recovered.setOnline(true); await recovered.synchronize();
  assert.deepEqual(recovered.queue(), []); assert.equal(Object.values(server.records.clients).filter(row => row.name === 'Cuenta anterior').length, 1); recovered.stop();
});

test('an identical duplicated item is edited independently after reconnecting', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const quote = (await app.request('/api/quotes', { method: 'POST', body: { items: [{ description: 'Original', quantity: 1, unitPrice: 10 }] } })).quote;
  const original = quote.items[0];
  const duplicated = (await app.request(`/api/quotes/${quote.id}/items/${original.id}/duplicate`, { method: 'POST' })).item;
  await app.request(`/api/quotes/${quote.id}/items/${duplicated.id}`, { method: 'PATCH', body: { description: 'Solo duplicado' } });
  app.setOnline(true); await app.synchronize();
  assert.deepEqual(app.queue(), []); const remote = Object.values(server.records.quotes)[0];
  assert.deepEqual(remote.items.map((item: Data) => item.description), ['Original', 'Solo duplicado']); app.stop();
});

test('full refresh updates item order and revision while pending local edits preserve their original baseline', async t => {
  const disk = await sqliteFixture(t), server = backend();
  server.records.quotes[5] = { id: 5, status: 'borrador', createdAt: new Date().toISOString(), items: [{ id: 6, description: 'Uno', quantity: 1, unitPrice: 10, subtotal: 10 }, { id: 7, description: 'Dos', quantity: 1, unitPrice: 20, subtotal: 20 }], total: 30 };
  const app = await prime(await disk.open(), server); app.setOnline(true); await app.synchronize();
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 180000;
    server.records.quotes[5].items.reverse(); await app.refresh();
    assert.deepEqual((await app.request('/api/quotes/5')).quote.items.map((item: Data) => item.id), [7, 6]);
    const refreshed = app.state().records['quotes/5'].version; assert.equal(refreshed, version(server.records.quotes[5]));
    app.setOnline(false); await app.request('/api/quotes/5/items/7', { method: 'PATCH', body: { description: 'Local pendiente' } });
    server.records.quotes[5].items[0].description = 'Otro equipo';
    await app.refresh(); // A disconnected refresh never touches locally pending edits.
    assert.equal((await app.request('/api/quotes/5')).quote.items[0].description, 'Local pendiente');
    assert.equal(app.state().records['quotes/5'].version, refreshed);
    app.setOnline(true); await app.synchronize(); assert.equal(app.queue()[0].code, 'OFFLINE_DOCUMENT_CONFLICT');
  } finally { Date.now = originalNow; app.stop(); }
});

test('cash sales preserve their paid state when items change, matching the standalone API rule', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const sale = (await app.request('/api/sales', { method: 'POST', body: { metodoPago: 'efectivo', items: [{ description: 'Artículo', quantity: 1, unitPrice: 100 }] } })).sale;
  await app.request(`/api/sales/${sale.id}/items/${sale.items[0].id}`, { method: 'PATCH', body: { unitPrice: 150 } });
  const edited = (await app.request(`/api/sales/${sale.id}`)).sale;
  assert.equal(edited.total, 150); assert.equal(edited.estadoPago, 'pagado'); app.stop();
});

test('clearing a client or branch removes its rendered snapshot immediately without internet', async t => {
  const disk = await sqliteFixture(t), server = backend(), app = await prime(await disk.open(), server);
  const client = (await app.request('/api/clients', { method: 'POST', body: { name: 'Cliente que se quita' } })).client;
  const branch = (await app.request('/api/branches', { method: 'POST', body: { name: 'Sucursal que se quita' } })).branch;
  const sale = (await app.request('/api/sales', { method: 'POST', body: { clientId: client.id, branchId: branch.id, metodoPago: 'por_pagar', items: [{ description: 'Artículo', quantity: 1, unitPrice: 10 }] } })).sale;
  await app.request(`/api/sales/${sale.id}`, { method: 'PATCH', body: { clientId: null, branchId: null } });
  const cleared = (await app.request(`/api/sales/${sale.id}`)).sale;
  assert.equal(cleared.clientId, null); assert.equal(cleared.client, null); assert.equal(cleared.clientName, null);
  assert.equal(cleared.branchId, null); assert.equal(cleared.branchName, null); app.stop();
});
