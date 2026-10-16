/* eslint-disable @typescript-eslint/no-require-imports -- Metro requiere referencias estáticas para estos assets de la WebView. */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import type { PdfViewerAssets } from './pdfViewerHtml';

let cached: Promise<PdfViewerAssets> | null = null;
async function read(moduleId: number) {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri).text();
}
export function loadPdfViewerAssets(): Promise<PdfViewerAssets> {
  if (!cached) {
    cached = Promise.all([
      read(require('../../assets/pdfjs/engine.pdfjs')),
      read(require('../../assets/pdfjs/worker.pdfjs')),
      read(require('../../assets/pdfjs/runtime.pdfjs')),
    ]).then(([engine, worker, runtime]) => ({ engine, worker, runtime }))
      .catch((error) => { cached = null; throw error; });
  }
  return cached;
}
