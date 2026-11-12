import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
export function useRemote<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void api<T>(path, 'GET', undefined, controller.signal)
      .then((value) => {
        setData(value);
        setError('');
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Sin conexión');
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, error, loading, reload };
}
export function useDebounced(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}
