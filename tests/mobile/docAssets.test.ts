import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

test('PDF assets are readable in Android releases as well as Expo Go and iOS', async t => {
  const modules = new Map<number, { bytes: Buffer; uri: string }>();
  const files = new Map<string, Buffer>();
  let release = true, failCopy = false, copies = 0;
  const mocks = globalThis as typeof globalThis & { __pdfAssetMocks?: unknown };
  const assetModule = (url: string) => {
    const id = modules.size + 1;
    const bytes = readFileSync(fileURLToPath(url));
    modules.set(id, { bytes, uri: 'assets_pdf_' + id });
    return id;
  };
  mocks.__pdfAssetMocks = {
    assetModule,
    Asset: {
      fromModule(id: number) {
        const source = modules.get(id)!;
        const uri = release ? source.uri : 'file:///cache/asset-' + id;
        if (!release) files.set(uri, source.bytes);
        // Expo marks packaged Android drawables downloaded even though this is a resource name.
        return { uri, localUri: uri, async downloadAsync() { return this; } };
      },
      fromURI(uri: string) {
        return { localUri: null as string | null, async downloadAsync() {
          copies++;
          if (failCopy) throw Error('Native resource copy failed');
          const source = [...modules.values()].find(asset => asset.uri === uri)!;
          assert.ok(source, 'Only a bundled resource can be materialized');
          this.localUri = 'file:///cache/' + uri;
          files.set(this.localUri, source.bytes);
          return this;
        } };
      },
    },
    File: class {
      constructor(readonly uri: string) { assert.ok(uri.startsWith('file:///'), 'A resource name is not a filesystem path'); }
      get size() { return files.get(this.uri)?.length ?? 0; }
      async base64() { return files.get(this.uri)!.toString('base64'); }
    },
  };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (['expo-asset', 'expo-file-system'].includes(specifier)) return { url: 'pdf-assets-test:' + specifier, shortCircuit: true };
      if (specifier === './remoteImage' && context.parentURL?.endsWith('/docAssets.ts')) return { url: 'pdf-assets-test:remote', shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === 'pdf-assets-test:expo-asset') return { format: 'module', shortCircuit: true, source: 'export const { Asset } = globalThis.__pdfAssetMocks;' };
      if (url === 'pdf-assets-test:expo-file-system') return { format: 'module', shortCircuit: true, source: 'export const { File } = globalThis.__pdfAssetMocks;' };
      if (url === 'pdf-assets-test:remote') return { format: 'module', shortCircuit: true, source: 'export async function loadRemoteImage() { return {dataUri:"data:image/png;base64,uploaded-logo"}; }' };
      if (/\.(png|ttf)$/.test(url)) return { format: 'commonjs', shortCircuit: true, source: 'module.exports = globalThis.__pdfAssetMocks.assetModule(' + JSON.stringify(url) + ');' };
      return next(url, context);
    },
  });
  t.after(() => { hooks.deregister(); delete mocks.__pdfAssetMocks; });
  const { loadDocImages, loadDocFonts } = await import('../../apps/mobile/src/lib/docAssets');
  const { buildDocumentFooter } = await import('../../apps/mobile/src/lib/documentFooter');
  await t.test('packaged Android icons become data URIs and the PDF keeps every enabled icon', async () => {
    const images = await loadDocImages({ logoUrl: 'https://example.test/logo.png' });
    for (const key of ['facebook', 'instagram', 'tiktok', 'linkedin', 'web', 'map'] as const) assert.match(images[key]!, /^data:image\/png;base64,iVBOR/);
    assert.equal(copies, 6);
    assert.deepEqual(images.warnings, []);
    assert.equal(images.logo, 'data:image/png;base64,uploaded-logo');
    const footer = buildDocumentFooter({ redes_sociales: '@negocio', website: 'www.negocio.test' }, images, 'La Paz');
    assert.equal((footer.match(/<img /g) ?? []).length, 6);
    assert.ok(!buildDocumentFooter({ redes_sociales: '@negocio', website: null, mostrar_facebook: false }, images, '').includes('alt="Facebook"'));
  });
  await t.test('file URIs from Expo Go and iOS remain readable without another asset copy', async () => {
    release = false;
    const before = copies;
    const images = await loadDocImages();
    const fonts = await loadDocFonts();
    assert.match(images.facebook!, /^data:image\/png;base64,/);
    for (const font of Object.values(fonts)) assert.match(font!, /^data:font\/ttf;base64,/);
    assert.equal(copies, before);
  });
  await t.test('an unreadable bundled icon produces a warning and loading can be retried', async () => {
    release = true; failCopy = true;
    const failed = await loadDocImages();
    assert.equal(failed.facebook, null);
    assert.ok(failed.warnings.some(warning => warning.includes('iconos')));
    failCopy = false;
    const retried = await loadDocImages();
    assert.match(retried.facebook!, /^data:image\/png;base64,/);
    assert.deepEqual(retried.warnings, []);
  });
});
