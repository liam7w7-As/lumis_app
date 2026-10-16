import { useEffect, useRef, useState } from 'react';
import { Image, type ImageProps } from 'react-native';
import { mediaUrl } from '../lib/api';
import { ImageLoadError, loadRemoteImage } from '../lib/remoteImage';

type StoredImageProps = Omit<ImageProps, 'source' | 'onError'> & {
  uri: string;
  token: string | null;
  onLoadError?: (error: Error) => void;
};

/** Las imágenes privadas se muestran desde la misma descarga autenticada que usa el PDF. */
export function StoredImage(props: StoredImageProps) {
  return <StoredImageSession key={props.uri + '|' + props.token} {...props} />;
}

function StoredImageSession({ uri, token, onLoadError, ...props }: StoredImageProps) {
  const url = mediaUrl(uri)!;
  const remote = /^https?:\/\//.test(url);
  const [localUri, setLocalUri] = useState<string | undefined>(remote ? undefined : url);
  const reportError = useRef(onLoadError);
  useEffect(() => { reportError.current = onLoadError; }, [onLoadError]);
  useEffect(() => {
    if (!remote) return;
    let active = true;
    void loadRemoteImage(url, token).then((image) => {
      if (active) setLocalUri(image.uri);
    }).catch((error: unknown) => {
      if (active) reportError.current?.(error instanceof Error ? error : new Error('No se pudo cargar la imagen.'));
    });
    return () => { active = false; };
  }, [url, token, remote]);

  return <Image resizeMethod="resize" {...props} key={localUri} source={localUri ? { uri: localUri } : undefined}
    onError={() => reportError.current?.(new ImageLoadError('invalid',
      'El archivo se descargó, pero no se pudo mostrar como imagen. Selecciona otro PNG, JPEG o WebP.'))} />;
}
