export const IS_NOVALED = process.env.EXPO_PUBLIC_BACKEND === 'novaled';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? (IS_NOVALED ? 'https://sistema.novaledbolivia.com' : 'http://localhost:3000')).replace(/\/+$/, '');
export const STORAGE_NAMESPACE = IS_NOVALED ? 'novaled_' + API_URL.replace(/[^a-zA-Z0-9._-]/g, '_') : 'lumis';
export const NOVALED_PREFIX = '/api/v1/lumis';

/** Only these legacy contracts have an equivalent in the connected application. */
export function backendPath(path: string, connected = IS_NOVALED): string {
  if (!connected) return path;
  if (path.startsWith(NOVALED_PREFIX + '/')) return path;
  const supported = ['/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/auth/preferences', '/api/business'];
  if (supported.includes(path)) return NOVALED_PREFIX + path.slice(4);
  throw new Error('Esta función todavía no está disponible en la conexión con Novaled.');
}
export function isConnectedRoute(path: string): boolean {
  return ['/dashboard', '/settings', '/quotes', '/quotes/new', '/pos', '/pos/new'].includes(path.replace(/\/$/, ''))
    || /^\/quotes\/\d+(\/preview)?\/?$/.test(path)
    || /^\/pos\/\d+(\/(preview|delivery|delivery-preview|payment-proof))?\/?$/.test(path);
}
