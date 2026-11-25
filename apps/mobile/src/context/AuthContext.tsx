import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiError, api, type User } from '../lib/api';
import { IS_NOVALED, STORAGE_NAMESPACE } from '../lib/backend';
import { novaled } from '../lib/novaled';
import { subscribeSessionExpiry } from '../lib/authEvents';
import { bindLegacySession, configureLegacyStorage } from '../lib/legacyOperation';
import { closeOfflineSession, openOfflineSession } from '../offline/runtime';

configureLegacyStorage({ get: key => SecureStore.getItemAsync(key), set: (key, value) => SecureStore.setItemAsync(key, value), remove: key => SecureStore.deleteItemAsync(key) });

const TOKEN_KEY = STORAGE_NAMESPACE + '_token';
const USER_KEY = STORAGE_NAMESPACE + '_token_user';

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

function rememberedUser(raw: string | null, token: string): User | null {
  try {
    const entry = JSON.parse(raw ?? 'null');
    const user = entry?.user;
    return entry?.version === 1 && entry.token === token && user && Number.isSafeInteger(user.id) && user.id > 0
      && Number.isSafeInteger(user.businessId) && user.businessId > 0
      && ['admin', 'seller'].includes(user.role) && typeof user.name === 'string' && typeof user.username === 'string'
      ? user as User : null;
  } catch { return null; }
}
function userSnapshot(user: User): User {
  return { id: user.id, businessId: user.businessId, name: user.name, username: user.username, email: user.email,
    role: user.role, themeMode: user.themeMode, branchId: user.branchId, permissions: user.permissions };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const activeToken = useRef<string | null>(null);
  const activeUser = useRef<User | null>(null);
  const rememberSession = useRef(false);
  const disk = useRef(Promise.resolve());

  // Serialize writes so a late update from an old account cannot overwrite logout
  // or the credentials of the account that logs in next.
  const persist = useCallback((nextToken: string | null, nextUser: User | null, version: number) => {
    const next = nextUser ? userSnapshot(nextUser) : null;
    const write = disk.current.catch(() => {}).then(async () => {
      if (nextToken && version !== revision.current) return;
      try {
        if (nextToken && next) {
          await SecureStore.setItemAsync(USER_KEY, JSON.stringify({ version: 1, token: nextToken, user: next }));
          await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
        } else {
          await SecureStore.deleteItemAsync(USER_KEY);
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
      } catch { /* SecureStore unavailable: this session remains in memory only. */ }
    });
    disk.current = write;
    return write;
  }, []);

  const adopt = useCallback(async (nextUser: User, nextToken: string, remember: boolean, version: number) => {
    if (version !== revision.current) return;
    activeToken.current = nextToken; activeUser.current = nextUser; rememberSession.current = remember;
    bindLegacySession(nextToken, nextUser.id);
    try {
      await openOfflineSession(nextUser, nextToken);
      if (version !== revision.current) return;
      await persist(remember ? nextToken : null, remember ? nextUser : null, version);
      if (version !== revision.current) return;
      setToken(nextToken); setUser(nextUser); setLoading(false);
    } catch (error) {
      if (version === revision.current) {
        activeToken.current = null; activeUser.current = null; rememberSession.current = false;
        closeOfflineSession(); setToken(null); setUser(null); setLoading(false);
      }
      throw error;
    }
  }, [persist]);
  const releaseRuntime = useCallback(() => {
    revision.current++; activeToken.current = null; activeUser.current = null; closeOfflineSession();
  }, []);

  useEffect(() => subscribeSessionExpiry(expiredToken => {
    if (expiredToken !== activeToken.current) return;
    const version = ++revision.current;
    activeToken.current = null; activeUser.current = null; rememberSession.current = false;
    closeOfflineSession();
    setToken(null); setUser(null);
    setLoading(false);
    void persist(null, null, version);
  }), [persist]);

  useEffect(() => {
    const version = ++revision.current;
    (async () => {
      try {
        const [stored, cached] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(USER_KEY)]);
        if (version !== revision.current) return;
        if (stored) {
          // Older installations only stored a token and need one successful lookup
          // to migrate. A matched, validated snapshot restores without HTTP.
          const local = rememberedUser(cached, stored);
          const me = local ?? (await api.me(stored)).user;
          await adopt(me, stored, true, version);
        }
      } catch (err) {
        if (version === revision.current && (!(err instanceof ApiError) || [401, 403].includes(err.status))) await persist(null, null, version);
      } finally {
        if (version === revision.current) setLoading(false);
      }
    })();
    return releaseRuntime;
  }, [adopt, persist, releaseRuntime]);

  const login = useCallback(async (username: string, password: string, remember = true) => {
    const version = ++revision.current;
    const { user: logged, token: newToken } = await api.login({ username, password });
    await adopt(logged, newToken, remember, version);
  }, [adopt]);

  const register = useCallback(async (username: string, name: string, password: string) => {
    const version = ++revision.current;
    const { user: created, token: newToken } = await api.register({ username, name, password });
    await adopt(created, newToken, true, version);
  }, [adopt]);

  const logout = useCallback(async () => {
    const previousToken = activeToken.current;
    const version = ++revision.current;
    activeToken.current = null; activeUser.current = null; rememberSession.current = false;
    closeOfflineSession();
    setToken(null);
    setUser(null);
    setLoading(false);
    await persist(null, null, version);
    if (IS_NOVALED && previousToken) {
      // La revocación remota no debe retrasar ni impedir el cierre local.
      void novaled.logout(previousToken).catch(() => {});
    }
  }, [persist]);

  const updateUser = useCallback((next: User) => {
    if (!activeToken.current || next.id !== activeUser.current?.id || next.businessId !== activeUser.current?.businessId) return;
    activeUser.current = next; setUser(next);
    if (rememberSession.current) void persist(activeToken.current, next, revision.current);
  }, [persist]);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, updateUser }),
    [user, token, loading, login, register, logout, updateUser],
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
