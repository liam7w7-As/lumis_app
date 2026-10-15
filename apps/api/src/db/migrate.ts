import fs from 'node:fs/promises';
import path from 'node:path';
import mysql, { RowDataPacket } from 'mysql2/promise';
import { config } from '../config';

// Se resuelve desde __dirname y no desde process.cwd(): en Hostinger el cwd no
// es necesariamente la raíz del paquete. Compilado queda en dist/db/, con tsx en
// src/db/ — en ambos casos dos niveles arriba está apps/api/migrations.
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

export async function runMigrations(): Promise<string[]> {
  const { host, port, user, password, database } = config.db;
  const admin = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true,
  });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await admin.changeUser({ database });
    await admin.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    const [rows] = await admin.query<RowDataPacket[]>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => String(r.version)));
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const pending: string[] = [];
    for (const file of files) {
      const version = file.slice(0, -'.sql'.length);
      if (applied.has(version)) continue;
      console.log(`Aplicando migración ${version}...`);
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await admin.query(sql);
      await admin.query('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
      pending.push(version);
    }
    return pending;
  } finally {
    await admin.end();
  }
}

const invokedDirectly =
  process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');

if (invokedDirectly) {
  runMigrations()
    .then((pending) => {
      console.log(
        pending.length === 0
          ? 'Base de datos al día.'
          : `Migraciones aplicadas: ${pending.join(', ')}`,
      );
    })
    .catch((err) => {
      console.error('Error al migrar. ¿Está MySQL de XAMPP en ejecución?');
      console.error(err);
      process.exit(1);
    });
}
