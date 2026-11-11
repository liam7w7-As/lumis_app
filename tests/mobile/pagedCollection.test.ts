import test from 'node:test';
import assert from 'node:assert/strict';
import { createPagedCollection } from '../../apps/mobile/src/lib/pagedCollection';
import { matchesQuoteSearch, searchTerm } from '../../apps/mobile/src/lib/documentSearch';

test('buscar una cotización usa el número visible y conserva el número anterior de Lumis', () => {
  const quote = { id: 1203, number: 42, clientName: 'Juan Luna' };
  assert.equal(matchesQuoteSearch(quote, '42'), true);
  assert.equal(matchesQuoteSearch(quote, ' #42 '), true);
  assert.equal(matchesQuoteSearch(quote, 'luna'), true);
  assert.equal(matchesQuoteSearch(quote, '1203'), false);
  assert.equal(matchesQuoteSearch({ id: 1203 }, '1203'), true);
  assert.equal(searchTerm(' #42 '), '42');
});

test('cargar más conserva filas, evita duplicados y termina en la última página', async () => {
  const calls: number[] = [];
  const store = createPagedCollection(async page => {
    calls.push(page);
    return { items: (page === 1 ? [1, 2] : [2, 3]).map(id => ({ id })), meta: { currentPage: page, lastPage: 2, total: 3 } };
  });
  await store.load();
  assert.deepEqual(store.getSnapshot().items.map(item => item.id), [1, 2]);
  assert.equal(store.getSnapshot().hasMore, true);
  await Promise.all([store.more(), store.more()]);
  assert.deepEqual(store.getSnapshot().items.map(item => item.id), [1, 2, 3]);
  await store.more();
  assert.deepEqual(calls, [1, 2]);
  assert.equal(store.getSnapshot().hasMore, false);
});

test('un fallo al cargar más conserva los datos y reintenta exactamente la página fallida', async () => {
  let fail = true;
  const calls: number[] = [];
  const store = createPagedCollection(async page => {
    calls.push(page);
    if (page === 2 && fail) throw Error('Sin conexión');
    return { items: [{ id: page }], meta: { currentPage: page, lastPage: 2, total: 2 } };
  });
  await store.load(); await store.more();
  assert.deepEqual(store.getSnapshot().items, [{ id: 1 }]);
  assert.equal(store.getSnapshot().error, 'Sin conexión');
  await store.more();
  fail = false;
  await store.more(true);
  assert.deepEqual(calls, [1, 2, 2]);
  assert.deepEqual(store.getSnapshot().items, [{ id: 1 }, { id: 2 }]);
  assert.equal(store.getSnapshot().error, null);
});

test('una actualización nueva ignora la respuesta anterior y el cierre ignora respuestas pendientes', async () => {
  const resolve: ((value: { items: { id: number }[] }) => void)[] = [];
  const store = createPagedCollection(() => new Promise<{ items: { id: number }[] }>(done => resolve.push(done)));
  const old = store.load(); const fresh = store.load(true);
  resolve[1]({ items: [{ id: 20 }] }); await fresh;
  resolve[0]({ items: [{ id: 10 }] }); await old;
  assert.deepEqual(store.getSnapshot().items, [{ id: 20 }]);
  const pending = store.load(); store.cancel();
  resolve[2]({ items: [{ id: 30 }] }); await pending;
  assert.deepEqual(store.getSnapshot().items, [{ id: 20 }]);
});

test('Lumis sin metadatos de paginación conserva su respuesta y no solicita páginas inexistentes', async () => {
  let calls = 0;
  const store = createPagedCollection(async () => { calls++; return { items: [{ id: 7 }] }; });
  await store.load(); await store.more();
  assert.deepEqual(store.getSnapshot().items, [{ id: 7 }]);
  assert.equal(store.getSnapshot().hasMore, false);
  assert.equal(calls, 1);
});
