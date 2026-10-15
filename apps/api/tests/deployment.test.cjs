const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { test } = require('node:test');

test('La API empaquetada carga fuera del monorepo sin dependencias externas', { timeout: 30000 }, () => {
  const apiDir = path.resolve(__dirname, '..');
  const buildDir = path.join(apiDir, 'dist');
  assert.ok(fs.existsSync(path.join(buildDir, 'node_modules')), 'Ejecuta npm run build antes de esta prueba.');
  const tempRoot = fs.realpathSync(os.tmpdir());
  const isolatedDir = fs.mkdtempSync(path.join(tempRoot, 'lumis-deployment-'));
  try {
    fs.cpSync(buildDir, isolatedDir, { recursive: true });
    const entry = path.join(isolatedDir, 'index.js');
    const requireIsolated = createRequire(entry);
    const manifest = JSON.parse(fs.readFileSync(path.join(isolatedDir, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(manifest.dependencies)) {
      assert.ok(requireIsolated.resolve(dependency).startsWith(path.join(isolatedDir, 'node_modules') + path.sep));
    }
    assert.equal(fs.existsSync(path.join(isolatedDir, 'node_modules', 'tsx')), false);
    assert.deepEqual(
      fs.readdirSync(path.join(isolatedDir, 'migrations')).sort(),
      fs.readdirSync(path.join(apiDir, 'migrations')).sort(),
    );
    // Sin MySQL: debe cargar toda la aplicación y llegar hasta la conexión a BD.
    // No se usan credenciales ni datos reales en esta prueba.
    const result = spawnSync(process.execPath, [entry], {
      cwd: isolatedDir,
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        NODE_ENV: 'production', NODE_PATH: '',
        JWT_SECRET: 'isolated-deployment-test-only',
        DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'test', DB_PASSWORD: '', DB_NAME: 'test',
        DOTENV_CONFIG_PATH: path.join(isolatedDir, 'no-env-file'),
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ECONNREFUSED/);
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|Cannot find module/);
  } finally {
    if (path.dirname(isolatedDir) !== tempRoot || !path.basename(isolatedDir).startsWith('lumis-deployment-')) {
      throw new Error('Ruta temporal inválida.');
    }
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  }
});
