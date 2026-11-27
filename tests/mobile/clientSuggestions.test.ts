import test from 'node:test';
import assert from 'node:assert/strict';
import { clientSearchKey, createClientSuggestions, matchingClients } from '../../apps/mobile/src/lib/clientSuggestions';
import type { Client } from '../../apps/mobile/src/lib/api';

const wait = (ms = 15) => new Promise<void>(resolve => setTimeout(resolve, ms));
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const client = (id: number, name: string): Client => ({ id, name, phone: null, email: null });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('client matching folds accents and whitespace, ranks exact/prefix/contains and treats symbols literally', () => {
  assert.equal(clientSearchKey('  ÁLVARO   ÑÚÑEZ  '), 'alvaro nunez');
  const input = [client(1, 'Servicio UMSA'), client(2, 'UMSA Institución'), client(3, 'UMSA'), client(4, 'Otro')];
  assert.deepEqual(matchingClients(input, 'umsa').map(item => item.id), [3, 2, 1]);
  assert.deepEqual(matchingClients([client(8, 'Álvaro Ñúñez')], 'alvaro nunez').map(item => item.id), [8]);
  assert.deepEqual(matchingClients([client(5, 'Descuento 50%_!'), client(6, '50XYZ')], '%_!').map(item => item.id), [5]);
  assert.deepEqual(matchingClients(input, '  '), []);
  assert.equal(matchingClients(input, 'umsa', 2).length, 2);
});

test('repeated client IDs are deduplicated while different clients with the same name remain selectable', () => {
  const initial = { ...client(1, 'UMSA'), phone: '70000000' };
  const latest = { ...client(1, 'UMSA'), phone: '71111111' };
  const homonym = { ...client(2, 'UMSA'), phone: '72222222' };
  const rows = matchingClients([initial, latest, homonym], 'UMSA');
  assert.equal(rows.length, 2);
  assert.equal(rows.find(item => item.id === 1)?.phone, '71111111');
  assert.equal(rows.find(item => item.id === 2)?.phone, '72222222');
});

test('suggestions wait for two characters and debounce successive edits into one request', async () => {
  const calls: string[] = [];
  const store = createClientSuggestions(async query => { calls.push(query); return [client(1, 'UMSA')]; }, 10);
  store.search(' '); store.search('U'); await wait(20);
  assert.deepEqual(calls, []);
  assert.equal(store.getSnapshot().loading, false);
  store.search('UM'); store.search('UMS'); store.search(' UMSA ');
  assert.equal(store.getSnapshot().loading, true);
  await wait(20);
  assert.deepEqual(calls, ['UMSA']);
  assert.equal(store.getSnapshot().query, 'UMSA');
  assert.deepEqual(store.getSnapshot().clients.map(item => item.id), [1]);
  assert.equal(store.getSnapshot().loading, false);
  store.cancel();
});

test('an old response cannot replace the latest query or reappear after a shorter query clears suggestions', async () => {
  const calls: { query: string; result: ReturnType<typeof deferred<Client[]>> }[] = [];
  const store = createClientSuggestions(query => { const result = deferred<Client[]>(); calls.push({ query, result }); return result.promise; }, 1);
  store.search('UM'); await wait();
  store.search('Alvaro'); await wait();
  calls[1].result.resolve([client(2, 'Álvaro Ñúñez')]); await tick();
  calls[0].result.resolve([client(1, 'UMSA')]); await tick();
  assert.equal(store.getSnapshot().query, 'Alvaro');
  assert.deepEqual(store.getSnapshot().clients.map(item => item.id), [2]);
  store.search('UMSA'); await wait();
  store.search('U');
  calls[2].result.resolve([client(3, 'UMSA')]); await tick();
  assert.equal(store.getSnapshot().query, 'U');
  assert.deepEqual(store.getSnapshot().clients, []);
  assert.equal(store.getSnapshot().loading, false);
  store.cancel();
});

test('closing cancels both an outstanding timer and an in-flight result without publishing stale clients', async () => {
  let calls = 0;
  const result = deferred<Client[]>();
  const store = createClientSuggestions(async () => { calls++; return result.promise; }, 5);
  store.search('UMSA'); store.cancel(); await wait();
  assert.equal(calls, 0);
  store.search('UMSA'); await wait();
  assert.equal(calls, 1);
  store.cancel(); const closed = store.getSnapshot();
  result.resolve([client(1, 'UMSA')]); await tick();
  assert.equal(store.getSnapshot(), closed);
  assert.deepEqual(store.getSnapshot().clients, []);
});

test('search errors can be retried without modifying the form and listeners can unsubscribe', async () => {
  let fail = true, notifications = 0;
  const calls: string[] = [];
  const store = createClientSuggestions(async query => {
    calls.push(query); if (fail) throw Error('private provider error'); return [client(1, 'UMSA')];
  }, 1);
  const unsubscribe = store.subscribe(() => { notifications++; });
  store.search('UMSA'); await wait();
  assert.equal(store.getSnapshot().error, 'No se pudieron buscar los clientes guardados.');
  assert.deepEqual(store.getSnapshot().clients, []);
  fail = false; store.retry(); await wait();
  assert.deepEqual(calls, ['UMSA', 'UMSA']);
  assert.equal(store.getSnapshot().error, null);
  assert.deepEqual(store.getSnapshot().clients.map(item => item.id), [1]);
  const count = notifications; unsubscribe();
  store.search('U'); assert.equal(notifications, count);
  store.cancel();
});
