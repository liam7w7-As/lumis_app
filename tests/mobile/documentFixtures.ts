import type { QuoteDetail, SaleDetail } from "../../apps/mobile/src/lib/api";
import { documentBusiness } from "../../apps/mobile/src/lib/documentBusiness";
import type { DocFonts, DocImages } from "../../apps/mobile/src/lib/docAssets";
export const documentItems = [
  {
    id: 1,
    productId: 1,
    description: "Interruptor termomagnético bipolar 32 A",
    quantity: 10,
    unit: "Unidad",
    unitPrice: 65,
    subtotal: 650,
    codigoInterno: "TM-32A",
    marca: "Aurora",
    procedencia: "Bolivia",
  },
  {
    id: 2,
    productId: 2,
    description: "Luminaria LED de uso exterior 50 W",
    quantity: 2,
    unit: "Unidad",
    unitPrice: 120,
    subtotal: 240,
    codigoInterno: "LED-50",
    marca: "Aurora",
    procedencia: null,
  },
];
export const sampleBusiness = {
  ...documentBusiness(null),
  nombre: "Comercial Aurora",
  direccion: "Av. Principal 123",
  ciudad: "La Paz",
  telefono: "+591 70000000",
  email: "ventas@example.test",
};
export const sampleQuote = {
  id: 42,
  versionNumero: 1,
  createdAt: "2026-11-13T14:30:00.000Z",
  client: { name: "Cliente de prueba", phone: null, email: null },
  sellerName: "Agente de prueba",
  items: documentItems,
  total: 890,
  status: "borrador",
  fechaVencimiento: null,
  terminos: null,
  notes: "Entrega coordinada con el cliente.",
  includeSeal: false,
  includeSignature: true,
  showNotes: true,
} as unknown as QuoteDetail;
export const sampleSale = {
  id: 25,
  createdAt: sampleQuote.createdAt,
  client: sampleQuote.client,
  sellerName: sampleQuote.sellerName,
  items: documentItems,
  total: 890,
  includeSello: true,
} as unknown as SaleDetail;
export const sampleImages = {
  logo: null,
  firma: null,
  sello: null,
  facebook: null,
  tiktok: null,
  instagram: null,
  linkedin: null,
  web: null,
  map: null,
  warnings: [],
} as DocImages;
export const sampleFonts = {
  regular: null,
  medium: null,
  semibold: null,
  bold: null,
} as DocFonts;
