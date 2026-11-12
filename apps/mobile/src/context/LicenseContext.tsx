import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, type CompanyLicense } from '../lib/api';
import { IS_NOVALED } from '../lib/backend';
import { subscribeLicenseChange } from '../lib/licenseEvents';
import { useAuth } from './AuthContext';
interface LicenseContextValue {
  license: CompanyLicense | null;
  error: string;
  refresh: () => Promise<void>;
}
const Context = createContext<LicenseContextValue>({
  license: null,
  error: '',
  refresh: async () => {},
});
export function LicenseProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (IS_NOVALED || !token) return children;
  return (
    <LicenseSession key={token} token={token}>
      {children}
    </LicenseSession>
  );
}
function LicenseSession({ token, children }: { token: string; children: ReactNode }) {
  const [license, setLicense] = useState<CompanyLicense | null>(null),
    [error, setError] = useState('');
  const refresh = useCallback(
    () =>
      api
        .license(token)
        .then((result) => {
          setLicense(result.license);
          setError('');
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'No se pudo comprobar el plan');
        }),
    [token],
  );
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const unsubscribe = subscribeLicenseChange(() => {
      void refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
      unsubscribe();
    };
  }, [refresh]);
  return <Context.Provider value={{ license, error, refresh }}>{children}</Context.Provider>;
}
export const useLicense = () => useContext(Context);
