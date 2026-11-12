import { copyFile, writeFile } from 'node:fs/promises';
await copyFile(
  new URL('../server.cjs', import.meta.url),
  new URL('../dist/server.cjs', import.meta.url),
);
// El servidor usa solo módulos integrados de Node; Hostinger puede ejecutar dist aislado.
await writeFile(
  new URL('../dist/package.json', import.meta.url),
  JSON.stringify(
    { name: 'lumis-admin-runtime', private: true, scripts: { start: 'node server.cjs' } },
    null,
    2,
  ),
);
