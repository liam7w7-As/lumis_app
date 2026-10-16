import { feedback } from './feedback';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { imageMime } from './remoteImage';

export type ReceiptExt = 'jpg' | 'jpeg' | 'png' | 'webp';
export interface PickedImage {
  uri: string;
  base64: string;
  ext: ReceiptExt;
}
async function pick(source: 'library' | 'camera'): Promise<PickedImage | null> {
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        feedback.warning('Permiso de cámara', 'Concede acceso a la cámara en los ajustes del teléfono para tomar una foto.');
        return null;
      }
    }
    // El selector de fotos del sistema permite elegir una imagen sin acceso a toda la galería.
    const options: ImagePicker.ImagePickerOptions = { quality: 1, allowsEditing: false, base64: false, mediaTypes: ['images'] };
    const result = source === 'library'
      ? await ImagePicker.launchImageLibraryAsync(options)
      : await ImagePicker.launchCameraAsync(options);
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset) { feedback.warning('Selecciona una imagen', 'El selector no devolvió ninguna imagen. Selecciónala de nuevo.'); return null; }
    const file = new File(asset.uri);
    if (file.size > 8 * 1024 * 1024) {
      feedback.warning('La imagen es muy grande', 'Selecciona un archivo de hasta 8 MB para subirlo.');
      return null;
    }
    const base64 = await file.base64();
    const mime = imageMime(base64);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : mime === 'image/webp' ? 'webp' : null;
    if (!ext) {
      feedback.warning('Formato no compatible', 'Usa una imagen PNG, JPEG o WebP. Si está en HEIC, expórtala primero a uno de esos formatos.');
      return null;
    }
    return { uri: asset.uri, base64, ext };
  } catch {
    feedback.error('No se pudo abrir la imagen', 'No se pudo leer el archivo seleccionado. Inténtalo de nuevo o elige otra imagen PNG, JPEG o WebP.');
    return null;
  }
}
export const pickImageFromLibrary = () => pick('library');
export const pickImageFromCamera = () => pick('camera');
