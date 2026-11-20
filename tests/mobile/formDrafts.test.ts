import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraftStorage, createFormDraftSession, EMPTY_CLIENT_FORM, EMPTY_PRODUCT_FORM,
  formDraftKey, readClientForm, readProductForm,
} from '../../apps/mobile/src/lib/formDrafts';

function device() {
  const data = new Map<string, string>();
  let failKey: ((key: string) => boolean) | null = null;
  const adapter = {
    get: async (key: string) => data.get(key) ?? null,
    set: async (key: string, value: string) => {
      if (failKey?.(key)) throw new Error('Device storage unavailable');
      assert.ok(Buffer.byteLength(value, 'utf8') < 2048, 'Native secure-store payload stays small');
      data.set(key, value);
    },
  };
  return { data, adapter, storage: createDraftStorage(adapter), fail: (condition: typeof failKey) => { failKey = condition; } };
}

test('client draft survives navigation and a fresh app process, then disappears after successful save', async () => {
  const phone = device();
  const form = createFormDraftSession(phone.storage, 'client', EMPTY_CLIENT_FORM, readClientForm);
  await form.load();
  form.update({ name: 'Comercial García' });
  form.update({ phone: '70000000', email: 'cliente@example.com' });
  await form.flush();
  const reopened = createFormDraftSession(createDraftStorage(phone.adapter), 'client', EMPTY_CLIENT_FORM, readClientForm);
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().value, { name: 'Comercial García', phone: '70000000', email: 'cliente@example.com' });
  assert.equal(reopened.getSnapshot().restored, true);
  await reopened.clear();
  const afterSave = createFormDraftSession(createDraftStorage(phone.adapter), 'client', EMPTY_CLIENT_FORM, readClientForm);
  await afterSave.load();
  assert.deepEqual(afterSave.getSnapshot().value, EMPTY_CLIENT_FORM);
  assert.equal(afterSave.getSnapshot().hasDraft, false);
});

test('product draft preserves decimal text, empty quantity, selected catalog item and metadata on restart', async () => {
  const phone = device();
  const form = createFormDraftSession(phone.storage, 'product', EMPTY_PRODUCT_FORM, readProductForm);
  await form.load();
  const input = { name: 'Cable', price: '12,50', quantity: '', unit: 'Metro', marca: 'Línea propia', procedencia: '',
    selectedProduct: { id: 21, name: 'Cable', marca: 'Catálogo', procedencia: 'Bolivia' } };
  form.update(input);
  await form.flush();
  const restarted = createFormDraftSession(createDraftStorage(phone.adapter), 'product', EMPTY_PRODUCT_FORM, readProductForm);
  await restarted.load();
  assert.deepEqual(restarted.getSnapshot().value, input);
});

test('draft keys isolate applications, API origins, tenants, users and document contexts without punctuation collisions', async () => {
  const phone = device();
  const main = formDraftKey('lumis', 'https://api.example.com', 3, 9, 'client');
  await phone.storage.write(main, { name: 'Cliente privado' });
  const alternatives = [
    formDraftKey('novaled', 'https://api.example.com', 3, 9, 'client'),
    formDraftKey('lumis', 'http://api.example.com', 3, 9, 'client'),
    formDraftKey('lumis', 'https://api.example.com', 4, 9, 'client'),
    formDraftKey('lumis', 'https://api.example.com', 3, 10, 'client'),
    formDraftKey('lumis', 'https://api.example.com', 3, 9, 'product.new-sale'),
    formDraftKey('lumis', 'https://api_example.com', 3, 9, 'client'),
  ];
  for (const key of alternatives) { assert.match(key, /^[a-zA-Z0-9._-]+$/); assert.equal(await phone.storage.read(key), null); }
  assert.equal(main, formDraftKey('lumis', 'https://api.example.com/', 3, 9, 'client'));
});

test('large Unicode drafts use small native values and an interrupted write retains the previous complete draft', async () => {
  const phone = device();
  const previous = { name: 'Original' };
  await phone.storage.write('unicode', previous);
  const value = { name: '🛍️ Empresa con ñ '.repeat(600) };
  phone.fail(key => key.endsWith('.1.2'));
  await assert.rejects(phone.storage.write('unicode', value));
  assert.deepEqual(await phone.storage.read('unicode'), previous);
  phone.fail(null);
  await phone.storage.write('unicode', value);
  assert.deepEqual(await createDraftStorage(phone.adapter).read('unicode'), value);
});

test('discard waits for pending writes and cannot resurrect the form after reopening', async () => {
  const phone = device();
  let release!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  const storage = createDraftStorage({ ...phone.adapter, set: async (key, value) => {
    if (key.endsWith('.0.0')) await paused;
    await phone.adapter.set(key, value);
  } });
  const form = createFormDraftSession(storage, 'client', EMPTY_CLIENT_FORM, readClientForm);
  await form.load();
  form.update({ name: 'Pendiente' });
  form.update({ name: 'Última tecla' });
  const discard = form.clear();
  form.update({ phone: 'No debe volver' });
  release();
  await discard;
  assert.equal(await storage.read('client'), null);
  assert.equal(form.getSnapshot().hasDraft, false);
  const restarted = createFormDraftSession(createDraftStorage(phone.adapter), 'client', EMPTY_CLIENT_FORM, readClientForm);
  await restarted.load();
  assert.deepEqual(restarted.getSnapshot().value, EMPTY_CLIENT_FORM);
});

test('failed storage writes keep input in memory, expose failure and can be retried', async () => {
  const phone = device();
  const form = createFormDraftSession(phone.storage, 'client', EMPTY_CLIENT_FORM, readClientForm);
  await form.load();
  phone.fail(() => true);
  form.update({ name: 'No perder esto' });
  await form.flush();
  assert.equal(form.getSnapshot().status, 'error');
  assert.equal(form.getSnapshot().value.name, 'No perder esto');
  phone.fail(null);
  await form.flush();
  assert.equal(form.getSnapshot().status, 'saved');
  assert.deepEqual(await phone.storage.read('client'), { name: 'No perder esto', phone: '', email: '' });
});

test('failed restoration never writes an empty form over the existing draft', async () => {
  const phone = device();
  await phone.storage.write('client', { name: 'Guardado', phone: '', email: '' });
  let failRead = true;
  const storage = createDraftStorage({ ...phone.adapter, get: async key => {
    if (failRead) throw new Error('Locked device');
    return phone.adapter.get(key);
  } });
  const form = createFormDraftSession(storage, 'client', EMPTY_CLIENT_FORM, readClientForm);
  await form.load();
  assert.equal(form.getSnapshot().ready, false);
  form.update({ name: 'No sobrescribir' });
  failRead = false;
  await form.load();
  assert.equal(form.getSnapshot().value.name, 'Guardado');
  assert.equal(form.getSnapshot().restored, true);
});

test('invalid stored form schemas require recovery rather than attaching a wrong product', async () => {
  assert.throws(() => readProductForm({ ...EMPTY_PRODUCT_FORM, selectedProduct: { id: -1, name: 'Incorrecto' } }));
  assert.throws(() => readClientForm({ name: 123, phone: '', email: '' }));
});

test('a last edit arriving as the previous write completes is also persisted', async () => {
  const phone = device();
  const form = createFormDraftSession(phone.storage, 'client', EMPTY_CLIENT_FORM, readClientForm);
  await form.load();
  let edited = false;
  form.subscribe(() => {
    if (!edited && form.getSnapshot().status === 'saved') {
      edited = true;
      form.update({ phone: '70012345' });
    }
  });
  form.update({ name: 'Último cambio' });
  await form.flush();
  assert.deepEqual(await phone.storage.read('client'), { name: 'Último cambio', phone: '70012345', email: '' });
});
