import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export type ReceiptExt = 'jpg' | 'jpeg' | 'png' | 'webp';

export interface PickedImage {
  /** URI local para previsualizar en la app. */
  uri: string;
  /** Contenido en base64 listo para subir a la API. */
  base64: string;
  ext: ReceiptExt;
}

function extFromAsset(asset: ImagePicker.ImagePickerAsset): ReceiptExt {
  const mime = asset.mimeType ?? '';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpeg';
  return 'jpg';
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
    quality: 0.5,
    base64: true,
  };
  const result =
    source === 'library'
      ? await ImagePicker.launchImageLibraryAsync({ ...options, mediaTypes: ['images'] })
      : await ImagePicker.launchCameraAsync(options);

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.base64) return null;
  return { uri: asset.uri, base64: asset.base64, ext: extFromAsset(asset) };
}

export function pickImageFromLibrary(): Promise<PickedImage | null> {
  return pick('library');
}

export function pickImageFromCamera(): Promise<PickedImage | null> {
  return pick('camera');
}
