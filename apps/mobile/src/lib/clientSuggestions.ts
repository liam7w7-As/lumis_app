import type { Client } from './api';

export function clientSearchKey(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function matchingClients<T extends { id: number; name: string }>(clients: T[], query: string, limit = 5): T[] {
  const key = clientSearchKey(query);
  if (!key) return [];
  const rank = (name: string) => name === key ? 0 : name.startsWith(key) ? 1 : 2;
  return [...new Map(clients.map(client => [client.id, client])).values()]
    .filter(client => clientSearchKey(client.name).includes(key))
    .sort((a, b) => rank(clientSearchKey(a.name)) - rank(clientSearchKey(b.name))
      || a.name.localeCompare(b.name, 'es') || a.id - b.id)
    .slice(0, limit);
}

interface Suggestions { query: string; clients: Client[]; loading: boolean; error: string | null }

/** A later query or a closed screen cannot be replaced by an earlier response. */
export function createClientSuggestions(fetchClients: (query: string) => Promise<Client[]>, delayMs = 250) {
  let state: Suggestions = { query: '', clients: [], loading: false, error: null };
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<Suggestions>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const cancel = () => { revision++; clearTimeout(timer); timer = undefined; };
  const search = (value: string) => {
    cancel();
    const query = value.trim().replace(/\s+/g, ' ');
    const request = revision;
    publish({ query, clients: [], error: null, loading: query.length >= 2 });
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      try {
        const clients = await fetchClients(query);
        if (request === revision) publish({ clients: matchingClients(clients, query), loading: false });
      } catch {
        if (request === revision) publish({ clients: [], loading: false, error: 'No se pudieron buscar los clientes guardados.' });
      }
    }, delayMs);
  };
  return { search, cancel, retry: () => search(state.query), getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
