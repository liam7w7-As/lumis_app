import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Borrador compartido por los flujos de cotización (/quotes/new) y de venta
// (/pos/new). Cada rama del router monta su propio provider, así que un
// borrador nunca se mezcla con el otro.
export interface DraftClient {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface DraftItem {
  key: string;
  productId: number | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  marca: string | null;
  procedencia: string | null;
}

interface DraftValue {
  client: DraftClient | null;
  setClient: (client: DraftClient | null) => void;
  items: DraftItem[];
  addItem: (item: Omit<DraftItem, 'key'>) => void;
  updateItem: (key: string, patch: Partial<Omit<DraftItem, 'key'>>) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const DraftContext = createContext<DraftValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<DraftClient | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const keyRef = useRef(0);

  const addItem = useCallback((item: Omit<DraftItem, 'key'>) => {
    keyRef.current += 1;
    const key = `${Date.now()}-${keyRef.current}`;
    setItems((prev) => [...prev, { ...item, key }]);
  }, []);

  const updateItem = useCallback((key: string, patch: Partial<Omit<DraftItem, 'key'>>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const clear = useCallback(() => {
    setClient(null);
    setItems([]);
  }, []);

  const value = useMemo(
    () => ({ client, setClient, items, addItem, updateItem, removeItem, clear }),
    [client, items, addItem, updateItem, removeItem, clear],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftValue {
  const ctx = useContext(DraftContext);
  if (!ctx) {
    throw new Error('useDraft debe usarse dentro de <DraftProvider>');
  }
  return ctx;
}
