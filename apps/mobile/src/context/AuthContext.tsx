import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiError, api, type User } from '../lib/api';
import { IS_NOVALED, STORAGE_NAMESPACE } from '../lib/backend';
import { novaled } from '../lib/novaled';
import { subscribeSessionExpiry } from '../lib/authEvents';

const TOKEN_KEY = STORAGE_NAMESPACE + '_token';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  register: (username: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function saveToken(token: string | null) {
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    // SecureStore no disponible (ej. web): la sesión vive solo en memoria.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeSessionExpiry(expiredToken => {
    if (expiredToken !== token) return;
    setToken(null); setUser(null);
    void saveToken(null);
  }), [token]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored) {
          const { user: me } = await api.me(stored);
          setToken(stored);
          setUser(me);
        }
      } catch (err) {
        if (!(err instanceof ApiError) || [401, 403].includes(err.status)) await saveToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string, remember = true) => {
    const { user: logged, token: newToken } = await api.login({ username, password });
    setToken(newToken);
    setUser(logged);
    await saveToken(remember ? newToken : null);
  }, []);

  const register = useCallback(async (username: string, name: string, password: string) => {
    const { user: created, token: newToken } = await api.register({ username, name, password });
    setToken(newToken);
    setUser(created);
    await saveToken(newToken);
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    await saveToken(null);
    if (IS_NOVALED && token) {
      // La revocación remota no debe retrasar ni impedir el cierre local.
      void novaled.logout(token).catch(() => {});
    }
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, updateUser: setUser }),
    [user, token, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}

export { ApiError };
