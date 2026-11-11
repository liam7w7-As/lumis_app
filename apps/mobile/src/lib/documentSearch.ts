export function searchTerm(value: string): string {
  return value.trim().replace(/^#\s*(?=\d)/, '').toLowerCase();
}

export function matchesQuoteSearch(quote: { id: number; number?: number; clientName?: string | null }, value: string): boolean {
  const query = searchTerm(value);
  return !query || !!quote.clientName?.toLowerCase().includes(query) || String(quote.number ?? quote.id).includes(query);
}
