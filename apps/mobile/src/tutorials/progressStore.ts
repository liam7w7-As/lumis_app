import type { TutorialProgress } from '../lib/api';
import { GUIDE_VERSION, isGuideKey, type GuideKey } from './catalog';

export interface LocalProgress extends TutorialProgress { pending: boolean }
export interface ProgressSnapshot {
  records: Partial<Record<GuideKey, LocalProgress>>;
  ready: boolean;
  online: boolean;
  syncing: boolean;
  error: string | null;
}
interface ProgressIO {
  readLocal: () => Promise<LocalProgress[]>;
  writeLocal: (record: LocalProgress) => Promise<void>;
  readRemote: () => Promise<TutorialProgress[]>;
  writeRemote: (record: TutorialProgress) => Promise<TutorialProgress>;
}
const valid = (record: TutorialProgress) => isGuideKey(record.guide) && record.version === GUIDE_VERSION &&
  ['in_progress', 'completed', 'skipped'].includes(record.status);

/** Una instancia pertenece a una sola cuenta; los acuses antiguos no reemplazan avances recientes. */
export function createProgressStore(io: ProgressIO) {
  let snapshot: ProgressSnapshot = { records: {}, ready: false, online: false, syncing: false, error: null };
  const listeners = new Set<() => void>();
  let disk = Promise.resolve();
  let sync: Promise<void> | null = null;
  let initialization: Promise<void> | null = null;
  let disposed = false;
  let mutations = 0;
  const publish = (patch: Partial<ProgressSnapshot>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const cache = (record: LocalProgress) => {
    disk = disk.catch(() => {}).then(() => io.writeLocal(record)).catch(() => {
      publish({ error: 'El avance se guarda en tu cuenta, pero no se pudo conservar una copia en este dispositivo.' });
    });
    return disk;
  };
  const flush = (): Promise<void> => {
    if (sync) return sync;
    sync = (async () => {
      publish({ syncing: true });
      try {
        await disk;
        while (!disposed) {
          const outgoing = Object.values(snapshot.records).find((record) => record?.pending);
          if (!outgoing) break;
          const saved = await io.writeRemote(outgoing);
          if (disposed) return;
          const key = outgoing.guide as GuideKey;
          if (snapshot.records[key] === outgoing) {
            const acknowledged = { ...saved, pending: false };
            publish({ records: { ...snapshot.records, [key]: acknowledged } });
            await cache(acknowledged);
          }
        }
        publish({ online: true, error: null });
      } catch {
        publish({ online: false, error: 'Tu avance queda pendiente de sincronizar. Se reintentará al volver a la app o desde Ayuda.' });
      } finally { publish({ syncing: false }); }
    })().finally(() => { sync = null; });
    return sync;
  };
  const refresh = async () => {
    if (disposed) return;
    const started = mutations;
    const pendingAtStart = new Set(Object.values(snapshot.records).filter((record) => record?.pending).map((record) => record!.guide));
    try {
      const remote = await io.readRemote();
      if (disposed) return;
      const merged = { ...snapshot.records };
      for (const record of remote.filter(valid)) {
        const key = record.guide as GuideKey;
        const current = merged[key];
        if (started === mutations && !current?.pending && !pendingAtStart.has(key) &&
          (!current || Date.parse(record.updatedAt) >= Date.parse(current.updatedAt))) {
          merged[key] = { ...record, pending: false };
          void cache(merged[key]!);
        }
      }
      publish({ records: merged, online: true, error: null });
    } catch {
      publish({ online: false, error: 'No se pudo consultar tu avance. Puedes usar las guías y sincronizarlas cuando vuelva la conexión.' });
    }
    publish({ ready: true });
    if (Object.values(snapshot.records).some((record) => record?.pending)) await flush();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: () => initialization ??= (async () => {
      let local: LocalProgress[] = [];
      try { local = await io.readLocal(); } catch { /* La API conserva el avance aunque falle la caché. */ }
      if (disposed) return;
      const records: ProgressSnapshot['records'] = {};
      for (const record of local.filter(valid)) records[record.guide as GuideKey] = record;
      publish({ records });
      await refresh();
    })(),
    save: (guide: GuideKey, status: TutorialProgress['status'], stepId: string | null) => {
      mutations++;
      const record: LocalProgress = { guide, version: GUIDE_VERSION, status, stepId,
        updatedAt: new Date().toISOString(), pending: true };
      publish({ records: { ...snapshot.records, [guide]: record } });
      void cache(record);
      void flush();
    },
    refresh,
    flush,
    dispose: () => { disposed = true; listeners.clear(); },
  };
}
