import type { CompanyLicense } from './api';

interface LicenseStamp {
  version: 1;
  plan: CompanyLicense['plan'];
  planName: string;
  state: CompanyLicense['state'];
  expiresOn: string | null;
  readOnly: boolean;
  hasSeat: boolean;
}
export interface LicenseChange {
  key: string;
  previous: LicenseStamp;
  current: CompanyLicense;
}
interface LicenseSnapshot {
  license: CompanyLicense | null;
  error: string;
  change: LicenseChange | null;
}
const stamp = (license: CompanyLicense): LicenseStamp => ({
  version: 1, plan: license.plan, planName: license.planName, state: license.state,
  expiresOn: license.expiresOn, readOnly: license.readOnly, hasSeat: license.hasSeat,
});
const fingerprint = (value: LicenseStamp) => JSON.stringify([
  value.plan, value.state, value.expiresOn, value.readOnly, value.hasSeat,
]);
function readStamp(raw: string | null): LicenseStamp | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    return value?.version === 1 && ['free', 'pro', 'plus'].includes(value.plan)
      && ['active', 'expired', 'suspended'].includes(value.state)
      && typeof value.planName === 'string'
      && (value.expiresOn === null || (typeof value.expiresOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.expiresOn)))
      && typeof value.readOnly === 'boolean' && typeof value.hasSeat === 'boolean' ? value : null;
  } catch { return null; }
}

/** Mantiene la licencia del servidor; el disco solo recuerda el aviso confirmado. */
export function createLicenseMonitor(io: {
  fetchLicense: () => Promise<CompanyLicense>;
  readLocal: () => Promise<string | null>;
  writeLocal: (value: string) => Promise<void>;
}) {
  let snapshot: LicenseSnapshot = { license: null, error: '', change: null };
  let acknowledged: LicenseStamp | null = null;
  let local: Promise<void> | null = null;
  let flight: Promise<void> | null = null;
  let disk = Promise.resolve();
  let active = true;
  let epoch = 0;
  const listeners = new Set<() => void>();
  const publish = (next: LicenseSnapshot) => {
    if (!active) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const save = (value: LicenseStamp) => {
    disk = disk.catch(() => {}).then(() => io.writeLocal(JSON.stringify(value))).catch(() => {});
    return disk;
  };
  const refresh = (): Promise<void> => {
    if (!active) return Promise.resolve();
    if (flight) return flight;
    const requestEpoch = epoch;
    const current = () => active && requestEpoch === epoch;
    const operation = (async () => {
      local ??= Promise.resolve().then(() => io.readLocal())
        .then(raw => { acknowledged = readStamp(raw); }).catch(() => {});
      await local;
      if (!current()) return;
      try {
        const license = await io.fetchLicense();
        if (!current()) return;
        const next = stamp(license);
        let change = snapshot.change;
        if (!acknowledged) {
          acknowledged = next;
          void save(next);
          change = null;
        } else if (fingerprint(acknowledged) === fingerprint(next)) {
          change = null;
        } else if (change?.key !== fingerprint(next)) {
          change = { key: fingerprint(next), previous: acknowledged, current: license };
        }
        publish({ license, error: '', change });
      } catch (err) {
        if (current()) publish({ ...snapshot, error: err instanceof Error ? err.message : 'No se pudo comprobar el plan' });
      }
    })().finally(() => { if (flight === operation) flight = null; });
    flight = operation;
    return operation;
  };
  return {
    refresh,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    acknowledge(key: string) {
      if (!active || snapshot.change?.key !== key) return Promise.resolve();
      acknowledged = stamp(snapshot.change.current);
      publish({ ...snapshot, change: null });
      return save(acknowledged);
    },
    resume() { active = true; },
    dispose() { active = false; epoch += 1; flight = null; },
  };
}
