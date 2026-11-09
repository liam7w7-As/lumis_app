import * as Print from 'expo-print';
import { Directory, File, Paths } from 'expo-file-system';
import { API_URL, NOVALED_PREFIX } from './backend';
import { notifySessionExpiry } from './authEvents';

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

export async function downloadNovaledQuotePdf(id: number, fileName: string, token: string): Promise<PreparedPdf> {
  return downloadNovaledPdf('quote', id, fileName, token);
}

export async function downloadNovaledPdf(kind: 'quote' | 'sale' | 'delivery' | 'payment-proof', id: number, fileName: string, token: string,
  signature?: { mode: 'asesor' | 'otro' | 'sin_nombre'; name: string }): Promise<PreparedPdf> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Documento no encontrado.');
  const path = kind === 'quote' ? '/quotes/' + id + '/pdf' : '/sales/' + id + (kind === 'sale' ? '/pdf' : '/' + kind + '/pdf');
  const options = signature && kind === 'delivery' ? '?firma_entrega=' + signature.mode + '&nombre_entrega=' + encodeURIComponent(signature.name) : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(API_URL + NOVALED_PREFIX + path + options, {
      headers: { Accept: 'application/pdf', Authorization: 'Bearer ' + token }, signal: controller.signal, redirect: 'error',
    });
    if (!response.ok) {
      if (response.status === 401) notifySessionExpiry(token);
      throw new Error(response.status === 401 ? 'La sesión ha vencido. Vuelve a iniciar sesión.' : 'No se pudo descargar el PDF de Novaled.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw new Error('El PDF es demasiado grande para esta vista.');
    if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('Novaled no devolvió un PDF válido.');
    const root = new Directory(Paths.cache, 'document-previews');
    try { prunePreviews(root); } catch { /* La limpieza no impide abrir el PDF. */ }
    const folder = new Directory(root, Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    folder.create({ intermediates: true });
    const file = new File(folder, fileName);
    file.create(); file.write(bytes);
    return { uri: file.uri, fileName, base64: await file.base64() };
  } catch (err) {
    if (controller.signal.aborted) throw new Error('El PDF tardó demasiado. Comprueba tu conexión y vuelve a intentar.');
    throw err;
  } finally { clearTimeout(timer); }
}
