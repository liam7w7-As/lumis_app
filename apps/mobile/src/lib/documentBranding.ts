export interface BrandingOptions {
  token?: string;
  logoUrl?: string | null;
  selloUrl?: string | null;
  includeSeal?: boolean;
}
export interface BrandingImages {
  logo: string | null;
  sello: string | null;
  warnings: string[];
}
/** Un adjunto opcional ausente no impide leer el documento ni sus importes. */
export async function resolveDocumentBranding(
  options: BrandingOptions,
  read: (url: string, token?: string) => Promise<string>,
): Promise<BrandingImages> {
  const images: BrandingImages = { logo: null, sello: null, warnings: [] };
  const entries: ['logo' | 'sello', string | null | undefined][] = [
    ['logo', options.logoUrl],
    ['sello', options.includeSeal === false ? null : options.selloUrl],
  ];
  const results = await Promise.all(entries.map(async ([kind, url]) => {
    if (!url) return { kind, image: null, warning: null };
    try { return { kind, image: await read(url, options.token), warning: null }; }
    catch (err) {
      return { kind, image: null, warning: (kind === 'logo' ? 'Logo: ' : 'Sello: ') +
        (err instanceof Error ? err.message : 'No se pudo cargar la imagen.') };
    }
  }));
  for (const result of results) {
    images[result.kind] = result.image;
    if (result.warning) images.warnings.push(result.warning);
  }
  return images;
}
