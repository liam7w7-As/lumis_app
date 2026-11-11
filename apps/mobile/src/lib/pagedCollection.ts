export interface PageMeta { currentPage: number; lastPage: number; total: number }
export interface CollectionPage<T> { items: T[]; meta?: PageMeta }
export interface CollectionState<T> {
  items: T[]; hasMore: boolean; loading: boolean; refreshing: boolean; loadingMore: boolean; error: string | null;
}

export function createPagedCollection<T extends { id: number }>(fetchPage: (page: number) => Promise<CollectionPage<T>>) {
  let state: CollectionState<T> = { items: [], hasMore: false, loading: true, refreshing: false, loadingMore: false, error: null };
  let revision = 0; let page = 0; let busy = false; let failedPage: number | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<CollectionState<T>>) => {
    state = { ...state, ...patch }; listeners.forEach(listener => listener());
  };
  const loadPage = async (next: number, refresh = false, silent = false) => {
    if (next > 1 && busy) return;
    const request = next === 1 ? ++revision : revision;
    busy = true;
    failedPage = null;
    publish({ error: null, loading: next === 1 && !refresh && (!silent || state.items.length === 0), refreshing: refresh, loadingMore: next > 1 });
    try {
      const result = await fetchPage(next);
      if (request !== revision) return;
      const items = next === 1 ? result.items : [...new Map([...state.items, ...result.items].map(item => [item.id, item])).values()];
      page = next;
      publish({ items, hasMore: !!result.meta && result.meta.currentPage < result.meta.lastPage });
    } catch (error) {
      if (request === revision) {
        failedPage = next;
        publish({ error: error instanceof Error ? error.message : 'No se pudo cargar la lista. Inténtalo otra vez.' });
      }
    } finally {
      if (request === revision) { busy = false; publish({ loading: false, refreshing: false, loadingMore: false }); }
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: (refresh = false, silent = false) => loadPage(1, refresh, silent),
    more: (retry = false) => retry && failedPage != null ? loadPage(failedPage)
      : state.hasMore && !state.error ? loadPage(page + 1) : Promise.resolve(),
    updateItems: (update: (items: T[]) => T[]) => publish({ items: update(state.items) }),
    cancel() { revision++; busy = false; },
  };
}
