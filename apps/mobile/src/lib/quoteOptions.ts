import type { QuoteDetail, QuoteUpdateInput } from "./api";
// Enviar únicamente cambios: exportar con otro sello no debe enviar notas sin editar.
export function changedQuoteOptions(
  quote: Pick<
    QuoteDetail,
    "notes" | "includeSeal" | "showNotes" | "includeSignature"
  >,
  next: {
    notes: string;
    includeSeal: boolean;
    showNotes: boolean;
    includeSignature: boolean;
  },
): QuoteUpdateInput {
  const patch: QuoteUpdateInput = {};
  const notes = next.notes.trim() || null;
  if (notes !== quote.notes) patch.notes = notes;
  if (next.includeSeal !== quote.includeSeal)
    patch.includeSeal = next.includeSeal;
  if (next.showNotes !== quote.showNotes) patch.showNotes = next.showNotes;
  if (next.includeSignature !== quote.includeSignature)
    patch.includeSignature = next.includeSignature;
  return patch;
}
