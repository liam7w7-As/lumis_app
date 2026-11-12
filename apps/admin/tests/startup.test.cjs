const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('la entrada empaquetada llama listen inmediatamente al importarla como Hostinger', (t) => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const isolated = fs.mkdtempSync(path.join(tempRoot, 'lumis-admin-startup-'));
  t.after(() => {
    if (path.dirname(isolated) !== tempRoot || !path.basename(isolated).startsWith('lumis-admin-startup-')) {
      throw new Error('Ruta temporal inválida');
    }
    fs.rmSync(isolated, { recursive: true, force: true });
  });
  fs.cpSync(path.join(__dirname, '../dist'), isolated, { recursive: true });
  const entry = path.join(isolated, 'server.cjs');
  // El cargador del hosting hace require(entry); entry no es require.main.
  // Interceptar listen comprueba el arranque síncrono sin abrir puertos reales.
  const loader = `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const calls = [];
    http.Server.prototype.listen = function (...args) { calls.push(args); return this; };
    require(process.argv[1]);
    assert.equal(calls.length, 1, 'La entrada debe llamar listen una vez al ser importada');
    assert.equal(calls[0][0], 31001, 'Debe usar el puerto proporcionado por el hosting');
  `;
  const result = spawnSync(process.execPath, ['-e', loader, entry], {
    cwd: isolated,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '31001',
      LUMIS_API_URL: 'https://api.example.test',
      PUBLIC_ORIGIN: 'https://admin.example.test',
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
