import { getDocumentClient } from './documentClient';

type DocumentKind = 'quote' | 'sale' | 'delivery';
type NamedDocument = Parameters<typeof getDocumentClient>[0] & { id: number; number?: number | string | null };
const prefixes: Record<DocumentKind, string> = { quote: 'COT', sale: 'NV', delivery: 'NE' };

function cleanPart(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}+/gu, '').toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

// Leave room for the prefix, document number and extension even on filesystems
// whose filename limit counts UTF-8 bytes rather than JavaScript characters.
function clientPart(value: string): string {
  let text = '', bytes = 0;
  for (const char of cleanPart(value)) {
    const code = char.codePointAt(0)!;
    const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes + size > 160) break;
    text += char; bytes += size;
  }
  return text.replace(/-+$/g, '') || 'SIN-CLIENTE';
}

export function documentFileName(kind: DocumentKind, document: NamedDocument): string {
  const number = cleanPart(String(document.number ?? document.id))
    .replace(/[^A-Z0-9-]/g, '').slice(0, 48).replace(/^-+|-+$/g, '') || String(document.id);
  return `${prefixes[kind]}-${clientPart(getDocumentClient(document).name)}-${number}.pdf`;
}
