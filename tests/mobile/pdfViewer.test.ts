import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildPdfViewerHtml } from '../../apps/mobile/src/lib/pdfViewerHtml';

test('motor y worker locales corresponden exactamente a la versión fijada de PDF.js', () => {
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pkg = JSON.parse(fs.readFileSync('apps/mobile/package.json', 'utf8'));
  const pdf = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['pdfjs-dist'], pdf.version);
  const hash = (value: Buffer) => crypto.createHash('sha256').update(value).digest('hex');
  let bytes = 0;
  for (const [bundled, source] of [['engine.pdfjs','pdf.min.mjs'], ['worker.pdfjs','pdf.worker.min.mjs']]) {
    const data = fs.readFileSync('apps/mobile/assets/pdfjs/' + bundled);
    assert.equal(hash(data), hash(fs.readFileSync(path.join(root, 'legacy/build', source))));
    bytes += data.byteLength;
  }
  assert.ok(bytes < 2 * 1024 * 1024, 'Solo se incluyen los dos archivos minificados, sin mapas ni visor completo.');
  assert.equal(fs.readFileSync('apps/mobile/assets/pdfjs/LICENSE','utf8'), fs.readFileSync(path.join(root,'LICENSE'),'utf8'));
});

test('el HTML local bloquea conexiones externas y escapa los cierres de script de sus assets', () => {
  const injected = '</script><script src="https://example.com/untrusted.js"></script>';
  const html = buildPdfViewerHtml({engine: injected, worker: injected, runtime: 'void 0;'}, false);
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!html.includes(injected));
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.ok(html.includes('worker-src blob:'));
});

test('modo oscuro mantiene las páginas PDF blancas y el mismo motor local', () => {
  const html = buildPdfViewerHtml({engine:'engine',worker:'worker',runtime:'void 0;'}, true);
  assert.ok(html.includes('color-scheme:light'));
  assert.ok(html.includes('.page{background:#fff'));
  assert.ok(html.includes('background:#151822'));
  assert.ok(html.includes('GlobalWorkerOptions.workerSrc=workerUrl'));
  new Function(fs.readFileSync('apps/mobile/assets/pdfjs/runtime.pdfjs','utf8'));
});
