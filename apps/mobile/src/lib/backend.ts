export const IS_NOVALED = process.env.EXPO_PUBLIC_BACKEND === 'novaled';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (IS_NOVALED ? 'https://sistema.novaledbolivia.com' : 'http://localhost:3000')).replace(/\/+$/, '');
export const STORAGE_NAMESPACE = IS_NOVALED ? 'novaled_' + API_URL.replace(/[^a-zA-Z0-9._-]/g, '_') : 'lumis';
export const NOVALED_PREFIX = '/api/v1/lumis';

export function backendPath(path: string, connected = IS_NOVALED): string {
  if (!connected) return path;
  if (path.startsWith(NOVALED_PREFIX + '/')) return path;
  const supported = ['/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/preferences'];
  if (supported.includes(path)) return NOVALED_PREFIX + path.slice(4);
  if (path.startsWith('/api/')) return NOVALED_PREFIX + '/ui/' + path.slice(5);
  throw new Error('Ruta de Lumis no reconocida.');
}
export function isConnectedRoute(path: string): boolean {
  return ['/dashboard', '/settings', '/help', '/quotes', '/quotes/new', '/pos', '/pos/new', '/quotes/new/item', '/quotes/new/client', '/pos/new/item', '/pos/new/client'].includes(path.replace(/\/$/, ''))
    || /^\/quotes\/\d+(\/(preview|add-item))?\/?$/.test(path)
    || /^\/pos\/\d+(\/(preview|item|delivery|delivery-preview|payment-proof))?\/?$/.test(path);
}
