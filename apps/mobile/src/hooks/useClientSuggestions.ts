import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from '../lib/api';
import { createClientSuggestions } from '../lib/clientSuggestions';

export function useClientSuggestions(name: string, token: string | null, enabled: boolean) {
  const store = useMemo(() => createClientSuggestions(async query => {
    if (!token) return [];
    // Both APIs accept at least 100 characters; the full query still filters the results.
    return (await api.clients(token, { search: query.slice(0, 100), page: 1 })).clients;
  }), [token]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useFocusEffect(useCallback(() => {
    store.search(enabled && token ? name : '');
    return store.cancel;
  }, [name, token, enabled, store]));
  const query = enabled && token ? name.trim().replace(/\s+/g, ' ') : '';
  const current = state.query === query ? state : { query, clients: [], loading: query.length >= 2, error: null };
  return { ...current, retry: store.retry };
}
