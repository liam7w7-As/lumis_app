import { badRequest } from '../middlewares/errorHandler';
export function decodeImage(base64: string): { buffer: Buffer; ext: 'png' | 'jpeg' | 'webp' } {
  const clean = base64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) throw badRequest('La imagen no es válida');
  const buffer = Buffer.from(clean, 'base64');
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw badRequest('La imagen debe pesar menos de 8 MB');
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { buffer, ext: 'png' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { buffer, ext: 'jpeg' };
  if (buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return { buffer, ext: 'webp' };
  throw badRequest('Selecciona una imagen PNG, JPEG o WebP');
}
