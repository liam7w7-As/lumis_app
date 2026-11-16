import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompanyLicense } from '../../apps/mobile/src/lib/api';
import { formatLicenseExpiry, licenseDaysRemaining, licenseExpiryMessage, licenseStatusLabel } from '../../apps/mobile/src/lib/licensePresentation';

function license(overrides: Partial<CompanyLicense> = {}): CompanyLicense {
  return {
    plan: 'pro', planName: 'Pro', state: 'active', expiresOn: '2026-11-30', readOnly: false,
    hasSeat: true, users: { enabled: 2, limit: 6 },
    quotas: Object.fromEntries(['quotes', 'sales', 'deliveries', 'scans'].map((key) => [key, { used: 0, limit: null, remaining: null, period: 'monthly' }])) as CompanyLicense['quotas'],
    features: { editDocuments: true, brandColors: true }, supportUrl: null, scannerAvailable: false,
    ...overrides,
  };
}

test('el vencimiento conserva el día de calendario y rechaza fechas inexistentes', () => {
  assert.equal(formatLicenseExpiry('2026-11-01'), '01/11/2026');
  assert.equal(formatLicenseExpiry('2028-02-29'), '29/02/2028');
  assert.equal(formatLicenseExpiry(null), 'Sin vencimiento');
  for (const value of ['', '2026-02-29', '2026-04-31', '2026-13-01', '2026-11-00', '01/11/2026']) {
    assert.equal(formatLicenseExpiry(value), 'Fecha no disponible');
    assert.equal(licenseDaysRemaining(value), null);
  }
});

test('los días restantes usan el calendario de Bolivia incluso cuando UTC cambia de día', () => {
  assert.equal(licenseDaysRemaining('2026-11-17', new Date('2026-11-17T03:59:00Z')), 1);
  assert.equal(licenseDaysRemaining('2026-11-16', new Date('2026-11-17T03:59:00Z')), 0);
  assert.equal(licenseDaysRemaining('2026-11-16', new Date('2026-11-17T04:00:00Z')), -1);
  assert.equal(licenseDaysRemaining('2026-11-16', new Date('2026-11-16T02:00:00Z')), 1);
  assert.equal(licenseDaysRemaining('2026-03-09', new Date('2026-03-08T03:59:00Z')), 2);
  assert.equal(licenseDaysRemaining(null), null);
});

test('el estado prioriza vencimiento, suspensión y falta de cupo sobre el plan', () => {
  assert.equal(licenseStatusLabel(license()), 'Activo');
  assert.equal(licenseStatusLabel(license({ state: 'expired', readOnly: true, hasSeat: false })), 'Vencido');
  assert.equal(licenseStatusLabel(license({ state: 'suspended', readOnly: true, hasSeat: false })), 'Suspendido');
  assert.equal(licenseStatusLabel(license({ readOnly: true, hasSeat: false })), 'Solo consulta · Sin cupo');
  assert.equal(licenseStatusLabel(license({ readOnly: true })), 'Solo consulta');
});

test('los avisos distinguen Gratis, vencimiento próximo, hoy y pasado', () => {
  const now = new Date('2026-11-16T22:30:00Z');
  assert.equal(licenseExpiryMessage(license({ plan: 'free', expiresOn: null }), now), 'Cupos totales, por única vez');
  assert.equal(licenseExpiryMessage(license({ expiresOn: '2026-11-16' }), now), 'Vence hoy');
  assert.equal(licenseExpiryMessage(license({ expiresOn: '2026-11-17' }), now), 'Vence mañana');
  assert.equal(licenseExpiryMessage(license({ expiresOn: '2026-11-23' }), now), 'Vence pronto · Quedan 7 días');
  assert.equal(licenseExpiryMessage(license({ expiresOn: '2026-11-30' }), now), 'Quedan 14 días');
  assert.equal(licenseExpiryMessage(license({ state: 'expired', expiresOn: '2026-11-15' }), now), 'Venció hace 1 día');
  assert.equal(licenseExpiryMessage(license({ expiresOn: null }), now), 'Consulta el vencimiento con soporte');
});
