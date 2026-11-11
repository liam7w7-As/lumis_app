import { STORAGE_NAMESPACE } from './backend';
type Body = Record<string, unknown>;
export interface PendingLegacyOperation { body: Body; fingerprint: string }
export interface OperationStorage { get: (key: string) => Promise<string | null>; set: (key: string,value: string) => Promise<void>; remove: (key: string) => Promise<void> }
const memory = new Map<string,string>();
let storage: OperationStorage = { get: async key => memory.get(key) ?? null, set: async (key,value) => { memory.set(key,value); }, remove: async key => { memory.delete(key); } };
const actors = new Map<string,number>(); const cache = new Map<string,PendingLegacyOperation | null>(); const listeners = new Set<() => void>();
export function configureLegacyStorage(value: OperationStorage) { storage = value; }
export function bindLegacySession(token: string,userId: number) { actors.set(token,userId); }
function key(path: string,token: string) { return STORAGE_NAMESPACE + '_operation_' + (actors.get(token) ?? token.split('|')[0].replace(/[^a-zA-Z0-9_-]/g,'').slice(0,30)) + '_' + path.replace(/[^a-zA-Z0-9]/g,'_'); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([name]) => !['solicitud_id','clave_operacion','stock_selections'].includes(name)).sort(([a],[b]) => a.localeCompare(b)).map(([name,input]) => [name,canonical(input)]));
  return value;
}
export function subscribeLegacyOperations(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function legacySnapshot(path: string,token: string) { return cache.get(key(path,token)) ?? null; }
function announce(path: string,token: string,value: PendingLegacyOperation | null) { cache.set(key(path,token),value); for (const listener of listeners) listener(); }
export async function readLegacyOperation(path: string,token: string) {
  const raw = await storage.get(key(path,token)); const value = raw ? JSON.parse(raw) as PendingLegacyOperation : null; announce(path,token,value); return value;
}
export async function rememberLegacyBody(path: string,token: string,body: Body) {
  const operation = { body,fingerprint: JSON.stringify(canonical(body)) }; await storage.set(key(path,token),JSON.stringify(operation)); announce(path,token,operation);
}
const running = new Map<string,{ fingerprint: string; promise: Promise<unknown> }>();
export async function runLegacyOperation<T>(path: string,token: string,body: Body,field: 'solicitud_id' | 'clave_operacion',id: () => string,send: (body: Body) => Promise<T>,definitive: (error: unknown) => boolean): Promise<T> {
  const operationKey = key(path,token); const active = running.get(operationKey);
  const fingerprint = JSON.stringify(canonical(body));
  if (active) {
    if (active.fingerprint !== fingerprint) throw Error('Hay otro envío en curso. Espera a que termine antes de guardar otro documento.');
    return active.promise as Promise<T>;
  }
  const promise = (async () => {
    const pending = await readLegacyOperation(path,token);
    if (pending && pending.fingerprint !== fingerprint) throw new Error('Hay un envío anterior pendiente de confirmar. Vuelve a abrir este formulario y pulsa Guardar para recuperarlo.');
    const payload = pending?.body ?? { ...body,[field]: id() };
    await rememberLegacyBody(path,token,payload);
    try {
      const result = await send(payload);
      await storage.remove(operationKey); announce(path,token,null); return result;
    } catch (error) {
      if (definitive(error)) { await storage.remove(operationKey); announce(path,token,null); }
      throw error;
    }
  })();
  running.set(operationKey,{ fingerprint,promise });
  try { return await promise; } finally { running.delete(operationKey); }
}
