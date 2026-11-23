import type { DocImages } from './docAssets';

export interface PdfFooterPreferences {
  mostrar_facebook?: boolean;
  mostrar_instagram?: boolean;
  mostrar_tiktok?: boolean;
  mostrar_linkedin?: boolean;
  mostrar_website?: boolean;
  mostrar_direccion?: boolean;
}

export const PDF_FOOTER_NETWORKS = [
  { key: 'mostrar_facebook', image: 'facebook', label: 'Facebook', icon: 'logo-facebook' },
  { key: 'mostrar_instagram', image: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { key: 'mostrar_tiktok', image: 'tiktok', label: 'TikTok', icon: 'logo-tiktok' },
  { key: 'mostrar_linkedin', image: 'linkedin', label: 'LinkedIn', icon: 'logo-linkedin' },
] as const;
export const PDF_FOOTER_OPTIONS = [
  ...PDF_FOOTER_NETWORKS,
  { key: 'mostrar_website', label: 'Sitio web', icon: 'globe-outline' },
  { key: 'mostrar_direccion', label: 'Dirección', icon: 'location-outline' },
] as const;
export type PdfFooterKey = keyof PdfFooterPreferences;

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildDocumentFooter(
  business: PdfFooterPreferences & { redes_sociales: string | null; website: string | null },
  images: Pick<DocImages, 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'web' | 'map'>,
  address: string,
): string {
  const icon = (src: string | null, alt: string) => src ? `<img class="footer-icon" src="${escapeHtml(src)}" alt="${alt}">` : '';
  const blocks: { className: string; weight: number; html: string }[] = [];
  const networks = PDF_FOOTER_NETWORKS.filter(network => business[network.key] !== false);
  if (networks.length && business.redes_sociales?.trim()) {
    blocks.push({ className: 'footer-left', weight: 30, html: networks.map(network => icon(images[network.image], network.label)).join('')
      + `<span class="footer-text">${escapeHtml(business.redes_sociales)}</span>` });
  }
  if (business.mostrar_website !== false && business.website?.trim()) {
    blocks.push({ className: 'footer-center', weight: 30, html: icon(images.web, 'Web') + `<span class="footer-text">${escapeHtml(business.website)}</span>` });
  }
  if (business.mostrar_direccion !== false && address.trim()) {
    blocks.push({ className: 'footer-right', weight: 40, html: icon(images.map, 'Ubicación') + `<span class="footer-text">${escapeHtml(address)}</span>` });
  }
  if (!blocks.length) return '';
  const weight = blocks.reduce((sum, block) => sum + block.weight, 0);
  return `<table><tr>${blocks.map(block => `<td class="${block.className}" style="width:${100 * block.weight / weight}%">${block.html}</td>`).join('')}</tr></table>`;
}
