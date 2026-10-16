import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { ApiError } from '../middlewares/errorHandler';

/** Crea la carpeta configurada al subir y no publica una URL si la escritura falla. */
export async function saveUpload(buffer: Buffer, ext: string, prefix: string) {
  const name = prefix + '-' + randomUUID() + '.' + ext;
  const filePath = path.join(config.uploadsDir, name);
  try {
    await fs.mkdir(config.uploadsDir, { recursive: true });
    await fs.writeFile(filePath, buffer, { flag: 'wx' });
    await fs.access(filePath, fs.constants.R_OK);
    return { url: '/uploads/' + name, filePath };
  } catch (err) {
    console.error('No se pudo escribir en el almacenamiento de imágenes:', config.uploadsDir, err);
    throw new ApiError(503,
      'No se pudo guardar la imagen. El almacenamiento del servidor no está disponible; revisa la carpeta de archivos y vuelve a intentarlo.',
      'UPLOAD_STORAGE_UNAVAILABLE');
  }
}
