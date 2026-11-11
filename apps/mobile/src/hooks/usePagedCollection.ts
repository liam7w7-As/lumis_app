import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { createPagedCollection, type CollectionPage } from '../lib/pagedCollection';

export function usePagedCollection<T extends { id: number }>(fetchPage: (page: number) => Promise<CollectionPage<T>>) {
  const store = useMemo(() => createPagedCollection(fetchPage), [fetchPage]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => { void store.load(); }, 250);
    return () => { clearTimeout(timer); store.cancel(); };
  }, [store]));
  return { ...state, load: store.load, loadMore: store.more, setItems: store.updateItems };
}
