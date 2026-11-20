import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { API_URL, IS_NOVALED } from '../lib/backend';
import { createDraftStorage, createFormDraftSession, formDraftKey } from '../lib/formDrafts';

const storage = createDraftStorage({ get: SecureStore.getItemAsync, set: SecureStore.setItemAsync });
// Retain pending writes and the last keystroke while a route is being removed.
const sessions = new Map<string, ReturnType<typeof createFormDraftSession<object>>>();

export function useFormDraft<T extends object>(form: string, empty: T, parse: (value: unknown) => T) {
  const { user } = useAuth();
  const key = user ? formDraftKey(IS_NOVALED ? 'novaled' : 'lumis', API_URL, user.businessId, user.id, form) : null;
  const session = useMemo(() => {
    if (!key) return createFormDraftSession(storage, 'signed-out', empty, parse);
    let existing = sessions.get(key);
    if (!existing) {
      existing = createFormDraftSession<object>(storage, key, empty, parse);
      sessions.set(key, existing);
    }
    return existing as ReturnType<typeof createFormDraftSession<T>>;
  }, [key, empty, parse]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    if (!key) return;
    void session.load();
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') void session.flush();
    });
    return () => { subscription.remove(); void session.flush(); };
  }, [key, session]);

  return { ...snapshot, update: session.update, clear: session.clear,
    retry: () => { void (snapshot.ready ? session.flush() : session.load()); } };
}
