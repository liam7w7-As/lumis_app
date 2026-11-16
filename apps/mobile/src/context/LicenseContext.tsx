import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, type CompanyLicense } from '../lib/api';
import { API_URL, IS_NOVALED, STORAGE_NAMESPACE } from '../lib/backend';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { createLicenseMonitor } from '../lib/licenseMonitor';
import { formatLicenseExpiry, licenseStatusLabel } from '../lib/licensePresentation';
import { feedback } from '../lib/feedback';
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
  const { token, user } = useAuth();
  if (IS_NOVALED || !token || !user) return children;
  return (
    <LicenseSession key={token} token={token} userId={user.id} businessId={user.businessId}>
      {children}
    </LicenseSession>
  );
}
function LicenseSession({ token, userId, businessId, children }: {
  token: string; userId: number; businessId: number; children: ReactNode;
}) {
  const store = useMemo(() => {
    const origin = API_URL.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = STORAGE_NAMESPACE + '_license_' + origin + '_' + businessId + '_' + userId + '_v1';
    return createLicenseMonitor({
      fetchLicense: () => api.license(token).then(result => result.license),
      readLocal: () => SecureStore.getItemAsync(key),
      writeLocal: value => SecureStore.setItemAsync(key, value),
    });
  }, [token, userId, businessId]);
  const { license, error, change } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const refresh = store.refresh;
  useEffect(() => {
    store.resume();
    void refresh();
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    const unsubscribe = subscribeLicenseChange(() => { void refresh(); });
    return () => {
      clearInterval(interval);
      subscription.remove();
      unsubscribe();
      store.dispose();
    };
  }, [store, refresh]);
  useEffect(() => {
    if (!change) return;
    const next = change.current;
    const acknowledge = () => { void store.acknowledge(change.key); };
    const transition = change.previous.plan !== next.plan
      ? `Tu empresa pasó de ${change.previous.planName} a ${next.planName}.`
      : `Se actualizó tu plan ${next.planName}.`;
    const expiry = next.expiresOn ? 'Vencimiento: ' + formatLicenseExpiry(next.expiresOn) + '.'
      : 'Tu plan no tiene fecha de vencimiento.';
    const access = next.readOnly ? 'Puedes consultar y exportar tus documentos. Revisa tu plan para recuperar el acceso de escritura.'
      : 'Los cambios ya están disponibles. Puedes continuar sin cerrar sesión.';
    const id = feedback.alert(next.readOnly ? 'Revisa tu plan' : 'Tu plan se actualizó',
      [transition, 'Estado: ' + licenseStatusLabel(next) + '.', expiry, access].join('\n\n'), [
        { text: 'Entendido', style: 'cancel', onPress: acknowledge },
        { text: 'Ver mi plan', onPress: () => { acknowledge(); router.push('/license'); } },
      ], { onDismiss: acknowledge });
    // Un aviso de una sesión cerrada nunca debe aparecer en otra cuenta.
    return () => feedback.remove(id);
  }, [store, change]);
  return <Context.Provider value={{ license, error, refresh }}>{children}</Context.Provider>;
}
export const useLicense = () => useContext(Context);
