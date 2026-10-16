PDF.js 6.4.299 (Mozilla, Apache-2.0).

engine.pdfjs y worker.pdfjs son copias sin modificar de legacy/build/*.min.mjs de pdfjs-dist.
Actualizar juntos con npm run sync:pdfjs --workspace=apps/mobile. No cargar desde CDN.
runtime.pdfjs es el visor de Lumis; se mantiene como código fuente y no lo modifica este script.
