import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';

// Solo se sustituye el adaptador nativo; las solicitudes HTTP y la caché de sesiones son reales.
test('imágenes privadas: reapertura, sesiones, archivos ausentes y validación antes del éxito', async (t) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const files = new Map<string, Buffer>();
  const requests: { method: string; url: string; authorization?: string }[] = [];
  let downloads = 0;
  let decoded = 0;
  let rejectDecode = false;
  const server = createServer((req, res) => {
    requests.push({ method: req.method!, url: req.url!, authorization: req.headers.authorization });
    if (!['Bearer admin-a', 'Bearer seller-a'].includes(req.headers.authorization ?? '')) {
      res.writeHead(401).end(); return;
    }
    if (req.url === '/missing.png') { res.writeHead(404).end(); return; }
    if (req.url === '/storage.png') { res.writeHead(503).end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(req.url === '/html.png' ? '<html>Error</html>' : png);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port;
  const previousUrl = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = base;
  class FakeFile {
    uri: string;
    constructor(_parent: unknown, name: string) { this.uri = 'file:///cache/' + name; }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length ?? 0; }
    async base64() { return files.get(this.uri)!.toString('base64'); }
    delete() { files.delete(this.uri); }
    static async downloadFileAsync(url: string, file: FakeFile, options: { headers?: HeadersInit }) {
      downloads++;
      const response = await fetch(url, { headers: options.headers });
      assert.equal(response.status, 200);
      files.set(file.uri, Buffer.from(await response.arrayBuffer()));
      return file;
    }
  }
  const mocks = globalThis as typeof globalThis & { __lumisImageMocks?: unknown };
  mocks.__lumisImageMocks = { File: FakeFile, Paths: { cache: 'file:///cache/' }, Image: {
    async getSize(uri: string) {
      decoded++;
      assert.ok(files.has(uri), 'El decodificador debe recibir el archivo descargado');
      if (rejectDecode) throw Error('Native decoder: image is corrupt');
      return { width: 1, height: 1 };
    },
  } };
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'expo-file-system' || specifier === 'react-native') {
        return { url: 'lumis-native-test:' + specifier, shortCircuit: true };
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url === 'lumis-native-test:expo-file-system') return { format: 'module', shortCircuit: true,
        source: 'export const { File, Paths } = globalThis.__lumisImageMocks;' };
      if (url === 'lumis-native-test:react-native') return { format: 'module', shortCircuit: true,
        source: 'export const { Image } = globalThis.__lumisImageMocks;' };
      return next(url, context);
    },
  });
  t.after(async () => {
    hooks.deregister();
    delete mocks.__lumisImageMocks;
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousUrl;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const { loadRemoteImage, ImageLoadError } = await import('../../apps/mobile/src/lib/remoteImage');
  await t.test('el logo se conserva al reabrir y ambas solicitudes envían la sesión', async () => {
    const first = await loadRemoteImage(base + '/logo.png', 'admin-a', true);
    const reopened = await loadRemoteImage(base + '/logo.png', 'admin-a');
    assert.equal(first.uri, reopened.uri);
    assert.match(first.uri, /\.png$/);
    assert.equal(first.dataUri, 'data:image/png;base64,' + png.toString('base64'));
    assert.equal(downloads, 1);
    assert.equal(decoded, 2, 'El éxito requiere que el decodificador nativo abra la imagen');
    assert.deepEqual(requests.map((r) => [r.method, r.authorization]), [
      ['HEAD', 'Bearer admin-a'], ['GET', 'Bearer admin-a'],
    ]);
  });
  await t.test('las solicitudes simultáneas comparten una descarga', async () => {
    const before = downloads;
    const [a, b] = await Promise.all([
      loadRemoteImage(base + '/shared.png', 'admin-a'), loadRemoteImage(base + '/shared.png', 'admin-a'),
    ]);
    assert.equal(a.uri, b.uri);
    assert.equal(downloads, before + 1);
  });
  await t.test('otra sesión descarga su propia copia y no hereda archivos privados', async () => {
    const admin = await loadRemoteImage(base + '/logo.png', 'admin-a');
    const seller = await loadRemoteImage(base + '/logo.png', 'seller-a');
    assert.notEqual(admin.uri, seller.uri);
    await assert.rejects(loadRemoteImage(base + '/logo.png', 'another-business'),
      (error: unknown) => error instanceof ImageLoadError && error.code === 'session');
  });
  await t.test('los errores distinguen archivo ausente, sesión y almacenamiento', async () => {
    for (const [route, token, code] of [
      ['/missing.png', 'admin-a', 'missing'], ['/storage.png', 'admin-a', 'storage'],
      ['/logo.png', null, 'session'],
    ] as const) {
      await assert.rejects(loadRemoteImage(base + route, token),
        (error: unknown) => error instanceof ImageLoadError && error.code === code);
    }
  });
  await t.test('una respuesta HTML nunca se acepta como imagen', async () => {
    const before = files.size;
    await assert.rejects(loadRemoteImage(base + '/html.png', 'admin-a'),
      (error: unknown) => error instanceof ImageLoadError && error.code === 'invalid');
    assert.equal(files.size, before);
  });
  await t.test('una cabecera PNG no basta: se rechaza si Android no puede abrirlo y permite reintentar', async () => {
    const before = files.size;
    rejectDecode = true;
    await assert.rejects(loadRemoteImage(base + '/corrupt.png', 'admin-a'),
      (error: unknown) => error instanceof ImageLoadError && error.code === 'invalid');
    assert.equal(files.size, before);
    rejectDecode = false;
    const recovered = await loadRemoteImage(base + '/corrupt.png', 'admin-a');
    assert.ok(files.has(recovered.uri));
  });
});
