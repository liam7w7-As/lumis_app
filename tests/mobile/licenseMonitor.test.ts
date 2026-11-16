import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyLicense } from '../../apps/mobile/src/lib/api';
import { createLicenseMonitor } from '../../apps/mobile/src/lib/licenseMonitor';

const license = (patch: Partial<CompanyLicense> = {}): CompanyLicense => ({
  plan: 'free', planName: 'Gratis', state: 'active', expiresOn: null, readOnly: false, hasSeat: true,
  users: { enabled: 1, limit: 2 }, features: { editDocuments: false, brandColors: false },
  quotas: Object.fromEntries(['quotes', 'sales', 'deliveries', 'scans'].map(key =>
    [key, { used: 0, limit: 5, remaining: 5, period: 'lifetime' }])) as CompanyLicense['quotas'],
  supportUrl: null, scannerAvailable: false, ...patch,
});
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  let raw: string | null = null;
  let current = license();
  const io = {
    fetchLicense: async () => current,
    readLocal: async () => raw,
    writeLocal: async (value: string) => { raw = value; },
  };
  return { io, update(next: CompanyLicense) { current = next; },
    create: () => createLicenseMonitor(io) };
}

test('la primera lectura establece la referencia y consumir cupos no anuncia cambios de plan', async () => {
  const f = fixture(), store = f.create();
  await store.refresh();
  assert.equal(store.getSnapshot().change, null);
  const current = license();
  current.quotas.quotes = { ...current.quotas.quotes, used: 1, remaining: 4 };
  f.update(current);
  await store.refresh();
  assert.equal(store.getSnapshot().change, null);
  assert.equal(store.getSnapshot().license?.quotas.quotes.used, 1);
});

test('el cambio y la renovación se avisan una vez al confirmarse, incluso tras reabrir la app', async () => {
  const f = fixture(), first = f.create();
  await first.refresh();
  await tick();
  f.update(license({ plan: 'pro', planName: 'Pro', expiresOn: '2026-12-16' }));
  await first.refresh();
  const pending = first.getSnapshot().change;
  assert.equal(pending?.previous.plan, 'free');
  assert.equal(pending?.current.plan, 'pro');
  await first.refresh();
  assert.equal(first.getSnapshot().change, pending, 'El sondeo no debe encolar de nuevo el mismo aviso');
  first.dispose();
  const reopened = f.create();
  await reopened.refresh();
  assert.equal(reopened.getSnapshot().change?.key, pending?.key, 'Un aviso sin confirmar se conserva al reabrir');
  await reopened.acknowledge(pending!.key);
  reopened.dispose();
  const third = f.create();
  await third.refresh();
  assert.equal(third.getSnapshot().change, null);
  f.update(license({ plan: 'pro', planName: 'Pro', expiresOn: '2027-01-16' }));
  await third.refresh();
  assert.equal(third.getSnapshot().change?.current.expiresOn, '2027-01-16');
});

test('vencimiento y pérdida de cupo actualizan el acceso; una confirmación vieja no oculta otro cambio', async () => {
  const f = fixture(), store = f.create();
  await store.refresh();
  f.update(license({ state: 'expired', readOnly: true }));
  await store.refresh();
  const expired = store.getSnapshot().change!;
  assert.equal(expired.current.state, 'expired');
  f.update(license({ hasSeat: false, readOnly: true }));
  await store.refresh();
  await store.acknowledge(expired.key);
  assert.equal(store.getSnapshot().change?.current.hasSeat, false);
  assert.equal(store.getSnapshot().license?.readOnly, true);
});

test('cada usuario mantiene su referencia y un caché dañado no concede permisos', async () => {
  const first = fixture(), second = fixture();
  const a = first.create(), b = second.create();
  await a.refresh();
  first.update(license({ plan: 'plus', planName: 'Plus' }));
  await a.refresh();
  await a.acknowledge(a.getSnapshot().change!.key);
  await b.refresh();
  assert.equal(b.getSnapshot().license?.plan, 'free');
  assert.equal(b.getSnapshot().change, null);
  const corrupt = createLicenseMonitor({ ...first.io, readLocal: async () => '{malformed' });
  assert.equal(corrupt.getSnapshot().license, null);
  await corrupt.refresh();
  assert.equal(corrupt.getSnapshot().change, null);
  assert.equal(corrupt.getSnapshot().license?.plan, 'plus');
});

test('consultas simultáneas se comparten y respuestas de una sesión cerrada se ignoran', async () => {
  let resolve!: (value: CompanyLicense) => void;
  let calls = 0;
  const store = createLicenseMonitor({
    readLocal: async () => null, writeLocal: async () => {},
    fetchLicense: () => { calls += 1; return new Promise<CompanyLicense>(done => { resolve = done; }); },
  });
  const a = store.refresh(), b = store.refresh();
  assert.equal(a, b);
  await tick();
  assert.equal(calls, 1);
  store.dispose();
  resolve(license({ plan: 'pro' }));
  await a;
  assert.equal(store.getSnapshot().license, null);
  store.resume();
  const next = store.refresh();
  await tick();
  resolve(license());
  await next;
  assert.equal(store.getSnapshot().license?.plan, 'free');
});

test('una falla de red conserva el dato anterior y no genera avisos falsos ni bucles', async () => {
  const f = fixture();
  let fail = false, calls = 0;
  const store = createLicenseMonitor({ ...f.io, fetchLicense: async () => {
    calls += 1;
    if (fail) { void store.refresh(); throw new Error('Sin conexión'); }
    return license();
  } });
  await store.refresh();
  fail = true;
  await store.refresh();
  assert.equal(calls, 2);
  assert.equal(store.getSnapshot().license?.plan, 'free');
  assert.equal(store.getSnapshot().error, 'Sin conexión');
  assert.equal(store.getSnapshot().change, null);
});
