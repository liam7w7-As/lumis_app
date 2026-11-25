import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { requestOnline, type User } from '../lib/api';
import { API_URL, IS_NOVALED } from '../lib/backend';
import { warmDocumentImages } from '../lib/remoteImage';
import { setOfflineGateway } from './bridge';
import { createOfflineEngine } from './engine';
import { openOfflineStore } from './sqliteStore';
import type { Status } from './types';
let engine: ReturnType<typeof createOfflineEngine> | null = null;
let remove: (() => void) | null = null;
let epoch = 0;
const listeners = new Set<() => void>();
const initial: Status = { online: true, syncing: false, pending: 0, errors: 0, preparing: false };
let snapshot = initial;
export const offlineSnapshot = () => snapshot;
export function subscribeOffline(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export const offlineOperations = () => engine?.queue() ?? [];
export const retryOffline = async () => { if (engine) {
    engine.setOnline(true);
    await engine.retry();
} };
export const resolveOfflineConflict = async (id: string) => engine?.forceConflict(id);
function publish() { snapshot = engine?.status() ?? initial; listeners.forEach(fn => fn()); }
export function closeOfflineSession() { epoch++; remove?.(); remove = null; engine?.stop(); engine = null; setOfflineGateway(null, null); publish(); }
export async function openOfflineSession(user: User, token: string) {
    closeOfflineSession();
    const version = epoch;
    const store = await openOfflineStore();
    if (version !== epoch)
        return;
    let lastRequest = 0;
    const next = createOfflineEngine({ store, scope: JSON.stringify([IS_NOVALED ? 'novaled' : 'lumis', API_URL, user.businessId, user.id]), user, connected: IS_NOVALED,
        send: async (path, options) => {
            // Novaled limits authenticated requests to 120/minute. Keep room for the
            // other screens and avoid exhausting this quota during the first download.
            if (IS_NOVALED) {
                const wait = Math.max(0, lastRequest + 750 - Date.now());
                lastRequest = Date.now() + wait;
                if (wait)
                    await new Promise(resolve => setTimeout(resolve, wait));
            }
            return requestOnline(path, { ...options, token });
        }, assets: async (business) => { await warmDocumentImages(business as {
            logo_url: string | null;
            sello_url: string | null;
        }, token); }, changed: publish });
    await next.initialize();
    if (version !== epoch) {
        next.stop();
        return;
    }
    engine = next;
    setOfflineGateway(next, token);
    publish();
    const apply = (value: Network.NetworkState) => { if (version === epoch)
        next.setOnline(value.isConnected !== false && value.isInternetReachable !== false); };
    const network = Network.addNetworkStateListener(apply);
    const reconnect = () => { void Network.getNetworkStateAsync().then(apply).catch(() => next.setOnline(true)); };
    const app = AppState.addEventListener('change', state => { if (state === 'active')
        reconnect(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active')
        reconnect(); }, 30000);
    remove = () => { network.remove(); app.remove(); clearInterval(timer); };
    reconnect();
}
