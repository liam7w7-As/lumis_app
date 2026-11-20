export interface DraftStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

type Head = { version: 1; slot: 0 | 1; chunks: number };

/** Small encrypted values, with the previous snapshot kept until the new one commits. */
export function createDraftStorage(storage: DraftStorage) {
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const task = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
    queues.set(key, task);
    void task.finally(() => { if (queues.get(key) === task) queues.delete(key); }).catch(() => {});
    return task;
  }
  async function head(key: string): Promise<Head | null> {
    const raw = await storage.get(key + '.head');
    if (raw === null) return null;
    const value = JSON.parse(raw) as Head;
    if (value.version !== 1 || ![0, 1].includes(value.slot) ||
      !Number.isInteger(value.chunks) || value.chunks < 0 || value.chunks > 256) {
      throw new Error('Invalid draft');
    }
    return value;
  }
  return {
    read: (key: string) => serial(key, async (): Promise<unknown> => {
      const current = await head(key);
      if (!current?.chunks) return null;
      const chunks: string[] = [];
      for (let i = 0; i < current.chunks; i++) {
        const value = await storage.get(`${key}.${current.slot}.${i}`);
        if (value === null) throw new Error('Incomplete draft');
        chunks.push(value);
      }
      return JSON.parse(chunks.join(''));
    }),
    write: (key: string, value: unknown) => serial(key, async () => {
      const previous = await head(key);
      const slot = previous?.slot === 0 ? 1 : 0;
      // 400 Unicode code points fit below the historical iOS 2 KB value limit.
      const characters = Array.from(JSON.stringify(value));
      const chunks = Math.ceil(characters.length / 400);
      if (chunks > 256) throw new Error('Draft too large');
      for (let i = 0; i < chunks; i++) {
        await storage.set(`${key}.${slot}.${i}`, characters.slice(i * 400, (i + 1) * 400).join(''));
      }
      await storage.set(key + '.head', JSON.stringify({ version: 1, slot, chunks }));
    }),
    clear: (key: string) => serial(key, async () => {
      // An empty committed snapshot cannot restore an old form after an interruption.
      await storage.set(key + '.head', JSON.stringify({ version: 1, slot: 0, chunks: 0 }));
    }),
  };
}

export function formDraftKey(app: string, apiUrl: string, businessId: number, userId: number, form: string) {
  // Encode the exact origin instead of replacing punctuation, which can collide.
  const origin = Array.from(apiUrl.replace(/\/+$/, '')).map(c => c.codePointAt(0)!.toString(16)).join('-');
  return `form_v1.${app}.${origin}.${businessId}.${userId}.${form}`;
}

export interface ClientFormDraft { name: string; phone: string; email: string }
export interface ProductFormDraft {
  name: string; price: string; quantity: string; unit: string; marca: string; procedencia: string;
  selectedProduct: { id: number; name: string; marca: string | null; procedencia: string | null } | null;
}
export const EMPTY_CLIENT_FORM: ClientFormDraft = { name: '', phone: '', email: '' };
export const EMPTY_PRODUCT_FORM: ProductFormDraft = {
  name: '', price: '', quantity: '', unit: 'Unidad', marca: '', procedencia: '', selectedProduct: null,
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid form draft');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid form field');
  return value;
}
export function readClientForm(value: unknown): ClientFormDraft {
  const data = record(value);
  return { name: string(data.name), phone: string(data.phone), email: string(data.email) };
}
export function readProductForm(value: unknown): ProductFormDraft {
  const data = record(value);
  let selectedProduct: ProductFormDraft['selectedProduct'] = null;
  if (data.selectedProduct !== null) {
    const product = record(data.selectedProduct);
    if (!Number.isSafeInteger(product.id) || (product.id as number) <= 0) throw new Error('Invalid product');
    selectedProduct = { id: product.id as number, name: string(product.name),
      marca: product.marca === null ? null : string(product.marca),
      procedencia: product.procedencia === null ? null : string(product.procedencia) };
  }
  return { name: string(data.name), price: string(data.price), quantity: string(data.quantity),
    unit: string(data.unit), marca: string(data.marca), procedencia: string(data.procedencia), selectedProduct };
}

export type FormDraftStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'clearing' | 'error';
export interface FormDraftSnapshot<T> {
  value: T; ready: boolean; hasDraft: boolean; restored: boolean; status: FormDraftStatus;
}

/** A session survives route unmounts; writes coalesce and never overtake a discard. */
export function createFormDraftSession<T extends object>(
  storage: ReturnType<typeof createDraftStorage>, key: string, empty: T, parse: (value: unknown) => T,
) {
  const emptyJson = JSON.stringify(empty);
  let snapshot: FormDraftSnapshot<T> = { value: empty, ready: false, hasDraft: false, restored: false, status: 'loading' };
  let revision = 0, savedRevision = 0, reading: Promise<void> | null = null, writing: Promise<void> | null = null;
  let clearing = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<FormDraftSnapshot<T>>) => {
    snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener());
  };
  const load = () => {
    if (snapshot.ready || reading) return reading ?? Promise.resolve();
    publish({ status: 'loading' });
    reading = storage.read(key).then(stored => {
      const value = stored === null ? empty : parse(stored);
      const hasDraft = JSON.stringify(value) !== emptyJson;
      publish({ value, ready: true, hasDraft, restored: hasDraft, status: hasDraft ? 'saved' : 'idle' });
    }).catch(() => { publish({ status: 'error' }); }).finally(() => { reading = null; });
    return reading;
  };
  const flush = (): Promise<void> => {
    if (writing) return writing;
    if (!snapshot.ready || clearing || revision === savedRevision) return Promise.resolve();
    publish({ status: 'saving' });
    writing = (async () => {
      do {
        while (!clearing && savedRevision < revision) {
          const target = revision, value = snapshot.value, hasDraft = snapshot.hasDraft;
          if (hasDraft) await storage.write(key, value); else await storage.clear(key);
          savedRevision = target;
        }
        if (!clearing) publish({ status: snapshot.hasDraft ? 'saved' : 'idle' });
      } while (!clearing && savedRevision < revision);
    })().catch(() => { if (!clearing) publish({ status: 'error' }); }).finally(() => { writing = null; });
    return writing;
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    load, flush,
    update(patch: Partial<T>) {
      if (!snapshot.ready || clearing) return;
      const value = { ...snapshot.value, ...patch };
      revision++;
      publish({ value, hasDraft: JSON.stringify(value) !== emptyJson });
      void flush();
    },
    async clear() {
      if (clearing) return;
      clearing = true; publish({ status: 'clearing' });
      await writing;
      try {
        await storage.clear(key);
        savedRevision = ++revision;
        publish({ value: empty, ready: true, hasDraft: false, restored: false, status: 'idle' });
      } catch (error) { publish({ status: 'error' }); throw error; }
      finally { clearing = false; }
    },
  };
}
