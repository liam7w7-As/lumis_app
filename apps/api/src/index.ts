import { config } from './config';
import { runMigrations } from './db/migrate';
import { createApp } from './app';

async function main() {
  await runMigrations();
  createApp().listen(config.port, () => console.log('lumis-api escuchando en puerto ' + config.port));
}
main().catch((err) => { console.error('No se pudo iniciar la API:', err); process.exit(1); });
