export type InlineSaveState = { status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'; message?: string };

/** Serializa escrituras parciales y conserva lo escrito durante una petición anterior. */
export function createInlineAutosave<K extends string>(options: {
  initial: Record<K, string>;
  normalize: (key: K, value: string) => string | null;
  write: (key: K, value: string | null) => Promise<string>;
  onChange: (values: Record<K, string>, states: Partial<Record<K, InlineSaveState>>) => void;
  onError: (key: K, message: string) => void;
}) {
  let values = { ...options.initial };
  let confirmed = { ...options.initial };
  const revisions = {} as Record<K, number>;
  let states: Partial<Record<K, InlineSaveState>> = {};
  let queue = Promise.resolve(true);
  const pending = new Map<K, { revision: number; task: Promise<boolean> }>();
  const notify = () => options.onChange({ ...values }, { ...states });
  const current = (key: K) => revisions[key] ?? 0;

  const change = (key: K, value: string) => {
    if (values[key] === value) return;
    values[key] = value;
    revisions[key] = current(key) + 1;
    states[key] = { status: value === confirmed[key] ? 'idle' : 'dirty' };
    notify();
  };
  const save = (key: K): Promise<boolean> => {
    const revision = current(key);
    const existing = pending.get(key);
    if (existing?.revision === revision) return existing.task;
    const raw = values[key];
    let normalized: string | null;
    try { normalized = options.normalize(key, raw); }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Revisa el dato ingresado.';
      states[key] = { status: 'error', message };
      notify();
      options.onError(key, message);
      return Promise.resolve(false);
    }
    // También se encola una vuelta al valor original si hay una escritura anterior pendiente.
    if (!pending.has(key) && (confirmed[key] || null) === normalized) {
      values[key] = normalized ?? '';
      if (states[key]?.status !== 'saved') states[key] = { status: 'idle' };
      notify();
      return Promise.resolve(true);
    }
    states[key] = { status: 'saving' };
    notify();
    const task = queue.then(async () => {
      try {
        const saved = (confirmed[key] || null) === normalized
          ? confirmed[key] : await options.write(key, normalized);
        confirmed[key] = saved;
        if (current(key) === revision) {
          values[key] = saved;
          states[key] = { status: 'saved' };
          notify();
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.';
        if (current(key) === revision) {
          states[key] = { status: 'error', message };
          notify();
          options.onError(key, message);
        }
        return false;
      } finally {
        if (pending.get(key)?.revision === revision) pending.delete(key);
      }
    });
    pending.set(key, { revision, task });
    queue = task;
    return task;
  };
  return {
    change, save,
    value: (key: K) => values[key],
    reset(next: Record<K, string>) {
      for (const key of Object.keys(next) as K[]) {
        const dirty = values[key] !== confirmed[key] || pending.has(key);
        confirmed[key] = next[key];
        if (!dirty) {
          values[key] = next[key];
          states[key] = { status: 'idle' };
        }
      }
      notify();
    },
    async flush() {
      let last: Promise<boolean>;
      do { last = queue; await last; } while (last !== queue);
    },
  };
}
