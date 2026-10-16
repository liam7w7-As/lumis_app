import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { loadRemoteImage } from '../lib/remoteImage';
import { useAuth } from './AuthContext';
import { useTheme, type ThemeMode } from '../theme/ThemeContext';
import { api, mediaUrl, type Business } from '../lib/api';
import { formatMoney as formatAmount } from '../lib/format';

type RememberedBrand = { name: string; logoUri: string | null };
interface BusinessValue {
  business: Business | null;
  rememberedBrand: RememberedBrand | null;
  error: string | null;
  refresh: () => Promise<void>;
  applyBusiness: (business: Business) => Promise<string | null>;
  changeMode: (mode: ThemeMode) => Promise<void>;
}
const BusinessContext = createContext<BusinessValue | null>(null);
const BRAND_CACHE = 'lumis_last_business_brand';
export function BusinessProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  return <BusinessSession key={token ?? "guest"}>{children}</BusinessSession>;
}
function BusinessSession({ children }: { children: ReactNode }) {
  const { token, updateUser } = useAuth();
  const { setBrandColor, setMode } = useTheme();
  const [business, setBusiness] = useState<Business | null>(null);
  const [rememberedBrand, setRememberedBrand] = useState<RememberedBrand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef(token);
  const revision = useRef(0);
  const preferenceWrites = useRef(Promise.resolve());
  const pendingPreferences = useRef(0);
  useEffect(() => {
    void SecureStore.getItemAsync(BRAND_CACHE).then((raw) => {
      if (raw) setRememberedBrand((current) => current ?? JSON.parse(raw));
    }).catch(() => {});
  }, []);
  const applyBusiness = useCallback(async (next: Business) => {
    if (!token || token !== session.current) return null;
    const appliedRevision = ++revision.current;
    setBusiness(next);
    await setBrandColor(next.color_primario);
    let logoUri: string | null = null;
    let imageError: string | null = null;
    if (next.logo_url) {
      try {
        const url = mediaUrl(next.logo_url)!;
        logoUri = (await loadRemoteImage(url, token)).uri;
      } catch (err) { imageError = err instanceof Error ? err.message : 'No se pudo cargar el logo.'; }
    }
    if (token !== session.current || revision.current !== appliedRevision) return null;
    const cached = { name: next.nombre, logoUri };
    setRememberedBrand(cached);
    setError(imageError);
    await SecureStore.setItemAsync(BRAND_CACHE, JSON.stringify(cached)).catch(() => {});
    return imageError;
  }, [token, setBrandColor]);

  const refresh = useCallback(async () => {
    if (!token || pendingPreferences.current > 0) return;
    const started = revision.current;
    try {
      const [{ business: next }, { user }] = await Promise.all([api.business(token), api.me(token)]);
      if (session.current !== token || started !== revision.current) return;
      const imageError = next ? await applyBusiness(next) : null;
      if (session.current !== token || revision.current !== started + (next ? 1 : 0)) return;
      updateUser(user);
      await setMode(user.themeMode ?? 'system');
      setError(imageError);
    } catch (err) {
      if (session.current === token) setError(err instanceof Error ? err.message : 'No se pudo sincronizar la empresa');
    }
  }, [token, applyBusiness, updateUser, setMode]);
  const changeMode = useCallback(async (mode: ThemeMode) => {
    if (!token) return;
    revision.current += 1;
    pendingPreferences.current += 1;
    const write = preferenceWrites.current.catch(() => {}).then(async () => {
      await api.updatePreferences(mode, token);
      if (session.current === token) await setMode(mode);
    });
    preferenceWrites.current = write;
    try { await write; } finally { pendingPreferences.current -= 1; revision.current += 1; }
  }, [token, setMode]);

  useEffect(() => {
    session.current = token;
    revision.current += 1;
    void setBrandColor(null);
    if (!token) { void setMode('system'); return; }
    // refresh actualiza estado solo después de esperar las respuestas HTTP.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 30000);
    return () => { subscription.remove(); clearInterval(timer); session.current = null; };
  }, [token, refresh, setBrandColor, setMode]);
  const value = useMemo(() => ({ business, rememberedBrand, error, refresh, applyBusiness, changeMode }),
    [business, rememberedBrand, error, refresh, applyBusiness, changeMode]);
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}
export function useBusiness(): BusinessValue {
  const context = useContext(BusinessContext);
  if (!context) throw new Error('Falta BusinessProvider');
  return context;
}
export function useMoney() {
  const { business } = useBusiness();
  return (value: number, symbol = business?.moneda ?? 'Bs.') => formatAmount(value, symbol);
}
