import type { ScannedLine } from './quoteVision';

export interface ScanProduct {
  id: number; name: string; description: string | null; price: number; stock: number;
  unit: string; codigoInterno: string | null; marca: string | null; procedencia: string | null;
}
export const normalizeScanText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9.,/\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
const numbers = (value: string) => value.match(/\d+(?:[.,]\d+)?/g)?.map(n => n.replace(',', '.')) ?? [];

export function rankScanProducts(line: ScannedLine, products: ScanProduct[]) {
  const name = normalizeScanText(line.name);
  const code = normalizeScanText(line.codigoInterno ?? '');
  const tokens = name.split(' ').filter(token => token.length > 1);
  const expectedNumbers = numbers(name);
  const ranked = products.map(product => {
    const candidate = normalizeScanText(product.name);
    const candidateCode = normalizeScanText(product.codigoInterno ?? '');
    const candidateNumbers = numbers(candidate);
    const codeMatch = (!!code && code === candidateCode) || (!!candidateCode && name === candidateCode);
    const technicalMismatch = expectedNumbers.some(n => !candidateNumbers.includes(n)) && name !== candidateCode;
    const exact = name === candidate || (codeMatch && !technicalMismatch);
    const hits = tokens.filter(token => candidate.split(' ').includes(token) || candidateCode === token).length;
    const score = exact ? 100 : codeMatch ? 80 : technicalMismatch ? 0 : Math.round(hits / Math.max(1, tokens.length) * 80);
    return { product, exact, score };
  }).filter(item => item.score >= 30).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  const exacts = ranked.filter(item => item.exact);
  const selectedProductId = exacts.length === 1 ? exacts[0].product.id : null;
  return {
    ...line,
    candidates: ranked.slice(0, 6).map(item => item.product), selectedProductId,
    match: selectedProductId !== null ? 'exact' as const : ranked.length ? 'suggested' as const : 'none' as const,
  };
}
