export interface PdfColumnPreferences {
  pdf_mostrar_marca?: boolean;
  pdf_mostrar_procedencia?: boolean;
}
export function documentColumns(
  preferences: PdfColumnPreferences,
  items: { marca: string | null; procedencia: string | null }[],
) {
  const showBrand =
    preferences.pdf_mostrar_marca !== false &&
    items.some((item) => !!item.marca?.trim());
  const showOrigin =
    preferences.pdf_mostrar_procedencia !== false &&
    items.some((item) => !!item.procedencia?.trim());
  return {
    showBrand,
    showOrigin,
    count: 7 + Number(showBrand) + Number(showOrigin),
    articleWidth: 30 + (!showBrand ? 9 : 0) + (!showOrigin ? 9 : 0),
  };
}
