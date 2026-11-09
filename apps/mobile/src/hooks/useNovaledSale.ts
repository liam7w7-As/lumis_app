import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { novaled, type MobileSale } from '../lib/novaled';
export function useNovaledSale(id: number) {
  const { token } = useAuth(); const revision = useRef(0);
  const [sale, setSale] = useState<MobileSale | null>(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!token) return; const current = ++revision.current; setLoading(true); setError(null);
    try { const result = await novaled.sale(id,token); if (current === revision.current) setSale(result.data); }
    catch (err) { if (current === revision.current) { setSale(null); setError(err instanceof Error ? err.message : 'No se pudo abrir la venta.'); } }
    finally { if (current === revision.current) setLoading(false); }
  }, [id,token]);
  useFocusEffect(useCallback(() => { void reload(); return () => { revision.current++; }; }, [reload]));
  return { sale, setSale, loading, error, reload };
}
