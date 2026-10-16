import * as Print from 'expo-print';
import { Directory, File, Paths } from 'expo-file-system';

export interface PreparedPdf { uri: string; fileName: string; base64: string }

function prunePreviews(root: Directory) {
  if (!root.exists) return;
  const expires = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of root.list()) {
    // Solo se borran temporales propios de este directorio, nunca documentos del usuario.
    if (entry instanceof Directory && /^[a-z0-9]+-[a-z0-9]+$/.test(entry.name) &&
      (entry.info().modificationTime ?? Date.now()) < expires) {
      try { entry.delete(); } catch { /* Un temporal ocupado se limpia en otra apertura. */ }
    }
  }
}
export async function generatePdfFile(html: string, fileName: string): Promise<PreparedPdf> {
  const result = await Print.printToFileAsync({ html, base64: true });
  if (!result.base64) throw new Error('No se pudo generar el archivo PDF.');
  const root = new Directory(Paths.cache, 'document-previews');
  try { prunePreviews(root); } catch { /* La limpieza no impide abrir el documento. */ }
  // Un directorio por vista evita reemplazar un PDF que otra app está compartiendo.
  const folder = new Directory(root, Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  folder.create({ intermediates: true });
  const file = new File(folder, fileName);
  file.create();
  file.write(result.base64, { encoding: 'base64' });
  try { new File(result.uri).delete(); } catch { /* Expo puede restringir el temporal de Print en Android. */ }
  // La cantidad de páginas la obtiene PDF.js del archivo; el contador de Print varía según el motor.
  return { uri: file.uri, fileName, base64: result.base64 };
}
export function assertPdfAvailable(pdf: PreparedPdf) {
  if (!new File(pdf.uri).exists) throw new Error('El archivo temporal ya no está disponible. Vuelve a abrir la vista previa.');
}
