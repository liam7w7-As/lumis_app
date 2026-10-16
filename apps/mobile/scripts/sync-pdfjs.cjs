const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
const target = path.resolve(__dirname, '../assets/pdfjs');
fs.mkdirSync(target, { recursive: true });
for (const [source, destination] of [
  ['legacy/build/pdf.min.mjs', 'engine.pdfjs'],
  ['legacy/build/pdf.worker.min.mjs', 'worker.pdfjs'],
  ['LICENSE', 'LICENSE'],
]) fs.copyFileSync(path.join(root, source), path.join(target, destination));
const { version } = require(path.join(root, 'package.json'));
fs.writeFileSync(path.join(target, 'README.md'),
  'PDF.js ' + version + ' (Mozilla, Apache-2.0).\n\n' +
  'engine.pdfjs y worker.pdfjs son copias sin modificar de legacy/build/*.min.mjs de pdfjs-dist.\n' +
  'Actualizar juntos con npm run sync:pdfjs --workspace=apps/mobile. No cargar desde CDN.\n' +
  'runtime.pdfjs es el visor de Lumis; se mantiene como código fuente y no lo modifica este script.\n');
console.log('PDF.js ' + version + ': motor y worker sincronizados.');
