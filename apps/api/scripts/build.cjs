const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const apiDir = path.resolve(__dirname, '..');
const outputDir = path.join(apiDir, 'dist');

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: apiDir,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Ejecuta este script con npm run build.');

// Solo se borra la salida generada de este paquete, nunca el node_modules del monorepo.
if (path.relative(apiDir, outputDir) !== 'dist') throw new Error('Ruta de salida inválida.');
fs.rmSync(outputDir, { recursive: true, force: true });
run(require.resolve('typescript/bin/tsc'), ['--project', path.join(apiDir, 'tsconfig.json')]);

const manifest = JSON.parse(fs.readFileSync(path.join(apiDir, 'package.json'), 'utf8'));
const runtimeManifest = { ...manifest, scripts: { start: 'node index.js' } };
fs.writeFileSync(path.join(outputDir, 'package.json'), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
fs.copyFileSync(path.join(apiDir, 'package-lock.json'), path.join(outputDir, 'package-lock.json'));
fs.cpSync(path.join(apiDir, 'migrations'), path.join(outputDir, 'migrations'), { recursive: true });

// Hostinger puede publicar el subdirectorio sin las dependencias elevadas a la raíz.
// Un prefijo propio y workspaces=false dejan todas las dependencias dentro de dist.
// include=prod prevalece sobre NPM_CONFIG_INCLUDE=dev usado para compilar TypeScript.
run(npmCli, [
  'ci', '--prefix', outputDir, '--workspaces=false', '--include=prod', '--omit=dev',
  '--ignore-scripts', '--no-audit', '--no-fund',
]);

const requireFromOutput = createRequire(path.join(outputDir, 'index.js'));
const modulesDir = path.join(outputDir, 'node_modules') + path.sep;
for (const dependency of Object.keys(manifest.dependencies)) {
  const resolved = requireFromOutput.resolve(dependency);
  if (!resolved.startsWith(modulesDir)) {
    throw new Error(`La dependencia ${dependency} quedó fuera del paquete de producción.`);
  }
}
console.log('API lista en dist: JavaScript, dependencias de producción y migraciones.');
