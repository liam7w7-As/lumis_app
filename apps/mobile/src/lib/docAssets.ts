import { mediaSource } from './api';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';

// PNGs en apps/mobile/assets/pdf/. Archivos de 1px (placeholder) se tratan
// como ausentes: el documento usa sus respaldos (nombre del negocio en texto,
// sin iconos), igual que la plantilla Blade.

export type DocAssetKey =
  | 'logo'
  | 'firma'
  | 'sello'
  | 'facebook'
  | 'tiktok'
  | 'instagram'
  | 'linkedin'
  | 'web'
  | 'map';

const ASSET_MODULES: Partial<Record<DocAssetKey, number>> = {
  facebook: require('../../assets/pdf/facebook.png'),
  tiktok: require('../../assets/pdf/tiktok.png'),
  instagram: require('../../assets/pdf/instagram.png'),
  linkedin: require('../../assets/pdf/linkedin.png'),
  web: require('../../assets/pdf/web.png'),
  map: require('../../assets/pdf/map.png'),
};

const FONT_MODULES: Record<string, number> = {
  regular: require('../../assets/fonts/Poppins-Regular.ttf'),
  medium: require('../../assets/fonts/Poppins-Medium.ttf'),
  semibold: require('../../assets/fonts/Poppins-SemiBold.ttf'),
  bold: require('../../assets/fonts/Poppins-Bold.ttf'),
};

async function moduleToRawBase64(moduleId: number): Promise<string | null> {
  try {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) {
      return null;
    }
    const file = new File(uri);
    if ((file.size ?? 0) < 100) {
      return null;
    }
    return await file.base64();
  } catch {
    return null;
  }
}

async function moduleToBase64(moduleId: number): Promise<string | null> {
  const base64 = await moduleToRawBase64(moduleId);
  return base64 ? `data:image/png;base64,${base64}` : null;
}

// Logo/sello subidos en Configuración: se descargan y se incrustan como data URI.
async function remoteToBase64(url: string, token?: string): Promise<string | null> {
  try {
    const destination = new File(
      Paths.cache,
      `lumis-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.img`,
    );
    const fetched = await File.downloadFileAsync(url, destination, { headers: mediaSource(url, token ?? null)?.headers });
    if ((fetched.size ?? 0) === 0) { fetched.delete(); throw new Error('Imagen vacía'); }
    const base64 = await fetched.base64();
    fetched.delete();
    const ext = url.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${base64}`;
  } catch {
    throw new Error('No se pudo cargar el logo o sello de la empresa. Revisa la conexión y vuelve a intentarlo.');
  }
}

export type DocImages = Record<DocAssetKey, string | null>;

export type DocFonts = {
  regular: string | null;
  medium: string | null;
  semibold: string | null;
  bold: string | null;
};

// El WebView de expo-print no puede leer file:// con base URL nula, así que
// las TTF se incrustan como data URI dentro del @font-face del documento.
export async function loadDocFonts(): Promise<DocFonts> {
  const entries = await Promise.all(
    (Object.keys(FONT_MODULES) as (keyof DocFonts)[]).map(
      async (weight): Promise<[keyof DocFonts, string | null]> => {
        const base64 = await moduleToRawBase64(FONT_MODULES[weight]);
        return [weight, base64 ? `data:font/ttf;base64,${base64}` : null];
      },
    ),
  );
  return Object.fromEntries(entries) as DocFonts;
}

export async function loadDocAsset(key: DocAssetKey): Promise<string | null> {
  const module = ASSET_MODULES[key];
  return module == null ? null : moduleToBase64(module);
}

export interface DocAssetOverrides {
  token?: string;
  logoUrl?: string | null;
  selloUrl?: string | null;
}

export async function loadDocImages(overrides: DocAssetOverrides = {}): Promise<DocImages> {
  const keys = Object.keys(ASSET_MODULES) as DocAssetKey[];
  const entries = await Promise.all(
    keys.map(async (key): Promise<[DocAssetKey, string | null]> => [key, await loadDocAsset(key)]),
  );
  const images = { logo: null, firma: null, sello: null, ...Object.fromEntries(entries) } as DocImages;

  if (overrides.logoUrl) {
    const logo = await remoteToBase64(overrides.logoUrl, overrides.token);
    if (logo) {
      images.logo = logo;
    }
  }
  if (overrides.selloUrl) {
    const sello = await remoteToBase64(overrides.selloUrl, overrides.token);
    if (sello) {
      images.sello = sello;
      // Con sello propio no se superpone la firma integrada.
      images.firma = null;
    }
  }

  return images;
}
