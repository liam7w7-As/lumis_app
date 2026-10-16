import test from 'node:test';
import assert from 'node:assert/strict';
import { createInlineAutosave, type InlineSaveState } from '../../apps/mobile/src/lib/inlineAutosave';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(write: (key: 'direccion' | 'ciudad', value: string | null) => Promise<string>) {
  let values = { direccion: 'Original', ciudad: 'La Paz' };
  let states: Partial<Record<keyof typeof values, InlineSaveState>> = {};
  const errors: string[] = [];
  const saver = createInlineAutosave({
    initial: values,
    normalize: (_key, value) => value.trim() || null,
    write,
    onChange: (next, nextStates) => { values = next; states = nextStates; },
    onError: (_key, message) => { errors.push(message); },
  });
  return { saver, errors, snapshot: () => ({ values, states }) };
}

test('salir de dos campos rápidamente guarda ambos sin sobrescribir lo que sigue escribiéndose', async () => {
  const first = deferred<string>();
  const calls: unknown[] = [];
  const f = fixture(async (key, value) => {
    calls.push({ [key]: value });
    return calls.length === 1 ? first.promise : value ?? '';
  });
  f.saver.change('direccion', 'Calle nueva');
  const saveAddress = f.saver.save('direccion');
  f.saver.change('ciudad', 'Santa Cruz');
  const saveCity = f.saver.save('ciudad');
  await Promise.resolve();
  assert.deepEqual(calls, [{ direccion: 'Calle nueva' }]);
  f.saver.change('direccion', 'Todavía escribiendo');
  first.resolve('Calle nueva');
  await Promise.all([saveAddress, saveCity]);
  assert.deepEqual(calls, [{ direccion: 'Calle nueva' }, { ciudad: 'Santa Cruz' }]);
  assert.equal(f.snapshot().values.direccion, 'Todavía escribiendo');
  assert.equal(f.snapshot().states.direccion?.status, 'dirty');
  assert.equal(f.snapshot().states.ciudad?.status, 'saved');
});

test('volver al valor original mientras se guarda envía también la última edición', async () => {
  const first = deferred<string>();
  const writes: (string | null)[] = [];
  const f = fixture(async (_key, value) => {
    writes.push(value);
    return writes.length === 1 ? first.promise : value ?? '';
  });
  f.saver.change('direccion', 'Temporal');
  void f.saver.save('direccion');
  f.saver.change('direccion', 'Original');
  const reverted = f.saver.save('direccion');
  first.resolve('Temporal');
  await reverted;
  assert.deepEqual(writes, ['Temporal', 'Original']);
  assert.equal(f.snapshot().values.direccion, 'Original');
  assert.equal(f.snapshot().states.direccion?.status, 'saved');
});

test('un fallo conserva el texto y permite reintentar sin bloquear el siguiente campo', async () => {
  let fail = true;
  const f = fixture(async (_key, value) => {
    if (fail) throw Error('Sin conexión');
    return value ?? '';
  });
  f.saver.change('direccion', 'Calle sin guardar');
  assert.equal(await f.saver.save('direccion'), false);
  assert.equal(f.snapshot().values.direccion, 'Calle sin guardar');
  assert.equal(f.snapshot().states.direccion?.status, 'error');
  fail = false;
  assert.equal(await f.saver.save('direccion'), true);
  f.saver.change('ciudad', 'Tarija');
  await f.saver.save('ciudad');
  assert.equal(f.snapshot().states.direccion?.status, 'saved');
  assert.equal(f.snapshot().values.ciudad, 'Tarija');
  assert.deepEqual(f.errors, ['Sin conexión']);
});

test('salir sin cambios no escribe y dos eventos de salida comparten la misma petición', async () => {
  const response = deferred<string>();
  let writes = 0;
  const f = fixture(async () => { writes++; return response.promise; });
  await f.saver.save('direccion');
  assert.equal(writes, 0);
  f.saver.change('direccion', 'Nueva dirección');
  const a = f.saver.save('direccion');
  const b = f.saver.save('direccion');
  assert.equal(a, b);
  response.resolve('Nueva dirección');
  await f.saver.flush();
  assert.equal(writes, 1);
});

test('recargar datos conserva un campo pendiente y actualiza los campos sin editar', () => {
  const f = fixture(async (_key, value) => value ?? '');
  f.saver.change('direccion', 'No descartar');
  f.saver.reset({ direccion: 'Desde servidor', ciudad: 'Sucre' });
  assert.equal(f.snapshot().values.direccion, 'No descartar');
  assert.equal(f.snapshot().values.ciudad, 'Sucre');
});
