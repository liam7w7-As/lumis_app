const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createReadStream } = require('node:fs');

function createServer(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, 'public'));
  const api = new URL(
    options.apiUrl || process.env.LUMIS_API_URL || 'https://lumis.novaledbolivia.com',
  );
  const origin =
    options.origin || process.env.PUBLIC_ORIGIN || 'https://admin-lumis.novaledbolivia.com';
  if (api.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(api.hostname))
    throw new Error('LUMIS_API_URL debe usar HTTPS');
  if (api.username || api.password || api.pathname !== '/' || api.search || api.hash)
    throw new Error('LUMIS_API_URL debe ser el origen de la API');
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon',
  };
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const json = (code, message) => {
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({ error: message }));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        if (!url.pathname.startsWith('/api/platform/')) return json(404, 'Ruta no encontrada');
        if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH'].includes(req.method))
          return json(405, 'Método no permitido');
        const mutation = !['GET', 'HEAD'].includes(req.method);
        if (mutation && req.headers.origin !== origin)
          return json(403, 'Origen del panel no autorizado');
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 65536) return json(413, 'Solicitud demasiado grande');
          chunks.push(chunk);
        }
        const headers = { accept: 'application/json' };
        if (req.headers.cookie) headers.cookie = req.headers.cookie;
        if (req.headers.origin) headers.origin = req.headers.origin;
        if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
        const response = await fetch(new URL(url.pathname + url.search, api), {
          method: req.method,
          headers,
          ...(mutation ? { body: Buffer.concat(chunks) } : {}),
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        });
        res.statusCode = response.status;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader('Set-Cookie', cookies);
        res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, 'Método no permitido');
      let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) && file !== root)
        return json(404, 'Archivo no encontrado');
      let stat = await fs.stat(file).catch(() => null);
      if (!stat?.isFile()) {
        if (path.extname(url.pathname)) return json(404, 'Archivo no encontrado');
        file = path.join(root, 'index.html');
        stat = await fs.stat(file);
      }
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      res.setHeader(
        'Cache-Control',
        file.includes(path.sep + 'assets' + path.sep)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
      if (req.method === 'HEAD') return res.end();
      await pipeline(createReadStream(file), res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(
        error instanceof URIError ? 400 : 502,
        'No se pudo completar la solicitud. Intenta de nuevo.',
      );
    }
  });
}
module.exports = { createServer };
