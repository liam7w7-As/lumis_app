import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Alert } from 'react-native';

export type ReceiptExt = 'jpg' | 'jpeg' | 'png' | 'webp';

export interface PickedImage {
  /** URI local para previsualizar en la app. */
  uri: string;
  /** Contenido en base64 listo para subir a la API. */
  base64: string;
  ext: ReceiptExt;
}

async function pick(source: 'library' | 'camera'): Promise<PickedImage | null> {
  if (source === 'library') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso necesario',
        'Concede acceso a tus fotos para adjuntar el comprobante.',
      );
      return null;
    }
  } else {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso necesario',
        'Concede acceso a la cámara para fotografiar el comprobante.',
      );
      return null;
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    quality: 1,
    allowsEditing: false,
    base64: false,
  };
  const result =
    source === 'library'
      ? await ImagePicker.launchImageLibraryAsync({ ...options, mediaTypes: ['images'] })
      : await ImagePicker.launchCameraAsync(options);

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  try {
    const file = new File(asset.uri);
    if (file.size > 8 * 1024 * 1024) { Alert.alert('Imagen muy grande', 'Selecciona una imagen de menos de 8 MB.'); return null; }
    const base64 = await file.base64();
    const ext = base64.startsWith('iVBORw0KGgo') ? 'png' : base64.startsWith('/9j/') ? 'jpeg' : base64.startsWith('UklGR') ? 'webp' : null;
    if (!ext) { Alert.alert('Formato no compatible', 'Selecciona una imagen PNG, JPEG o WebP.'); return null; }
    return { uri: asset.uri, base64, ext };
  } catch { Alert.alert('Imagen', 'No se pudo leer la imagen seleccionada.'); return null; }
}

export function pickImageFromLibrary(): Promise<PickedImage | null> {
  return pick('library');
}

export function pickImageFromCamera(): Promise<PickedImage | null> {
  return pick('camera');
}
