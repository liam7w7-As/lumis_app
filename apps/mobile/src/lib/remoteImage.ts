import { File, Paths } from 'expo-file-system';
import { Image } from 'react-native';
import { mediaSource } from './api';

export class ImageLoadError extends Error {
  constructor(public code: 'missing' | 'session' | 'storage' | 'connection' | 'invalid', message: string) {
    super(message);
    this.name = 'ImageLoadError';
  }
}
function cacheKey(url: string) {
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) hash = Math.imul(hash ^ url.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function imageMime(base64: string): string | null {
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return null;
}
/** La validación HTTP distingue archivos ausentes de problemas de conexión. */
async function readRemoteImage(url: string, token: string | null, validate = false) {
  const extension = /\.(png|jpe?g|webp)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'img';
  const file = new File(Paths.cache, 'lumis-image-' + cacheKey(url) + '-' + cacheKey(token ?? 'public') + '.' + extension);
  const headers = mediaSource(url, token).headers;
  try {
    if (validate || !file.exists || file.size === 0) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, { method: 'HEAD', headers, signal: controller.signal });
        if (response.status === 404) throw new ImageLoadError('missing',
          'La imagen ya no está en el servidor. Vuelve a subir el archivo original desde Configuración.');
        if (response.status === 401 || response.status === 403) throw new ImageLoadError('session',
          'No se pudo acceder a la imagen. Vuelve a iniciar sesión e inténtalo otra vez.');
        if (!response.ok) throw new ImageLoadError('storage',
          'El servidor no pudo entregar la imagen. Revisa el almacenamiento y vuelve a intentarlo.');
      } finally { clearTimeout(timer); }
      if (!file.exists || file.size === 0) {
        if (file.exists) file.delete();
        await File.downloadFileAsync(url, file, { headers });
      }
    }
    const base64 = await file.base64();
    const mime = imageMime(base64);
    if (!mime) {
      file.delete();
      throw new ImageLoadError('invalid', 'El archivo no es una imagen válida. Sube nuevamente un PNG, JPEG o WebP.');
    }
    try {
      const { width, height } = await Image.getSize(file.uri);
      if (width <= 0 || height <= 0) throw new Error('Dimensiones inválidas');
    } catch {
      file.delete();
      throw new ImageLoadError('invalid',
        'El archivo no se puede abrir como imagen. Selecciona otro PNG, JPEG o WebP e inténtalo de nuevo.');
    }
    return { uri: file.uri, dataUri: 'data:' + mime + ';base64,' + base64 };
  } catch (err) {
    if (err instanceof ImageLoadError) throw err;
    if (file.exists) { try { file.delete(); } catch { /* Se reintentará con otro archivo. */ } }
    throw new ImageLoadError('connection', 'No se pudo descargar la imagen. Comprueba tu conexión y vuelve a intentarlo.');
  }
}

const pending = new Map<string, Promise<{uri: string; dataUri: string}>>();
export function loadRemoteImage(url: string, token: string | null, validate = false) {
  const key = url + '|' + token;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = readRemoteImage(url, token, validate).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
