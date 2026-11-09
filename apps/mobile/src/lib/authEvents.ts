const listeners = new Set<(token: string) => void>();

export function subscribeSessionExpiry(listener: (token: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifySessionExpiry(token: string): void {
  for (const listener of listeners) listener(token);
}
