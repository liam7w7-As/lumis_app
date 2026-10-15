// Port de App\Support\BrandColorPalette (Laravel) a TypeScript.
// Misma matemática: paleta HSL interpolada + contraste WCAG.

function sanitizeHex(hex: string, fallback = '5842f4'): string {
  const clean = hex.replace(/^#/, '');
  return clean.length === 6 && /^[0-9a-fA-F]{6}$/.test(clean) ? clean : fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = sanitizeHex(hex);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  const l = (max + min) / 2;

  if (delta === 0) {
    return [0, 0, l];
  }

  const s = l < 0.5 ? delta / (max + min) : delta / (2 - max - min);

  let h: number;
  if (max === r) {
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  h = (h / 6) % 1;
  if (h < 0) {
    h += 1;
  }

  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) {
    t += 1;
  }
  if (t > 1) {
    t -= 1;
  }
  if (t < 1 / 6) {
    return p + (q - p) * 6 * t;
  }
  if (t < 1 / 2) {
    return q;
  }
  if (t < 2 / 3) {
    return p + (q - p) * (2 / 3 - t) * 6;
  }
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function generatePalette(hex: string): Record<string, string> {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);

  const baseLightness = Math.min(l, 0.28);
  const baseSaturation = Math.min(s, 0.85);
  const steps: Record<string, { l: number; s: number }> = {
    '50': { l: 0.97, s: Math.min(1.0, s * 0.15) },
    '100': { l: 0.93, s: Math.min(1.0, s * 0.2) },
    '200': { l: 0.87, s: Math.min(1.0, s * 0.35) },
    '300': { l: Math.min(0.75, baseLightness + 0.32), s: baseSaturation * 0.7 },
    '400': { l: Math.min(0.6, baseLightness + 0.2), s: baseSaturation * 0.8 },
    '500': { l: Math.min(0.5, baseLightness + 0.1), s: baseSaturation * 0.9 },
    '600': { l: baseLightness, s: baseSaturation },
    '700': { l: Math.max(0, baseLightness - 0.08), s: Math.min(1.0, baseSaturation * 1.05) },
    '800': { l: Math.max(0, baseLightness - 0.16), s: Math.min(1.0, baseSaturation * 1.05) },
    '900': { l: Math.max(0, baseLightness - 0.24), s: Math.min(1.0, baseSaturation * 0.95) },
    '950': { l: Math.max(0, baseLightness - 0.28), s: Math.min(1.0, baseSaturation * 0.8) },
  };

  const palette: Record<string, string> = {};
  for (const [weight, params] of Object.entries(steps)) {
    const [nr, ng, nb] = hslToRgb(h, params.s, params.l);
    palette[`brand-${weight}`] = toHex(nr, ng, nb);
  }
  const [pr, pg, pb] = hslToRgb(h, s, l);
  palette['brand-primary'] = toHex(pr, pg, pb);
  const [rr, rg, rb] = hslToRgb(h, baseSaturation, baseLightness);
  palette['brand-readable'] = toHex(rr, rg, rb);
  palette['brand-on-readable'] = contrastText(palette['brand-readable']);
  palette['brand-on-primary'] = contrastText(palette['brand-primary']);

  return palette;
}

export function contrastText(hex: string): string {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6) {
    return '#ffffff';
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const linearize = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

  const luminance = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);

  return luminance >= 0.35 ? '#111111' : '#ffffff';
}

export function readable(hex: string): string {
  return generatePalette(hex)['brand-600'] ?? '#5842f4';
}

/** Hue en grados (0-360), saturación y luminosidad en 0-1. */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return [h * 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const normalized = (((h % 360) + 360) % 360) / 360;
  const [r, g, b] = hslToRgb(normalized, clamp(s), clamp(l));
  return toHex(r, g, b);
}

/** Ajusta el color para que sea legible como primario sobre fondo oscuro. */
export function forDarkBackground(hex: string): string {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) {
    return '#7a5cff';
  }

  const [r, g, b] = hexToRgb(clean);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = l < 0.58 ? 0.65 : l > 0.78 ? 0.74 : l;
  const [nr, ng, nb] = hslToRgb(h, s, newL);
  return toHex(nr, ng, nb);
}

/** Par de paradas [claro, oscuro] para un gradiente derivado del color de marca. */
export function gradientFor(hex: string): [string, string] {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) {
    return ['#9d8cff', '#5a2ff0'];
  }

  const [r, g, b] = hexToRgb(clean);
  const [h, s, l] = rgbToHsl(r, g, b);

  const light = hslToHex(h * 360, Math.min(1, Math.max(s, 0.45)), Math.min(0.8, Math.max(0.7, l + 0.18)));
  const dark = hslToHex(h * 360, Math.min(1, s * 1.05), Math.min(0.6, Math.max(0.4, l - 0.08)));

  return [light, dark];
}

export function forBackground(hex: string): string {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) {
    return '#5842f4';
  }

  const [r, g, b] = hexToRgb(clean);
  const [h, s, l] = rgbToHsl(r, g, b);

  let newL = l;
  let newS = s;

  if (l > 0.92) {
    if (s < 0.15) {
      const [nr, ng, nb] = hslToRgb(0, 0, 0.3);
      return toHex(nr, ng, nb);
    }
    newL = 0.8;
    newS = Math.max(s, 0.5);
    const [nr, ng, nb] = hslToRgb(h, newS, newL);
    return toHex(nr, ng, nb);
  }

  if (l > 0.8 && s < 0.2) {
    newL = 0.65;
  }

  const [nr, ng, nb] = hslToRgb(h, newS, newL);
  return toHex(nr, ng, nb);
}
