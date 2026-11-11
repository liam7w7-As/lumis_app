import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import { IS_NOVALED } from '../lib/backend';
import { legacySnapshot, readLegacyOperation, subscribeLegacyOperations } from '../lib/legacyOperation';
export function useLegacyPending(path: string) {
  const { token } = useAuth();
  const pending = useSyncExternalStore(subscribeLegacyOperations,() => token && IS_NOVALED ? legacySnapshot(path,token):null,() => null);
  useEffect(() => { if (IS_NOVALED && token) void readLegacyOperation(path,token).catch(() => {}); }, [path,token]);
  return pending;
}
