import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import mysql, { RowDataPacket } from 'mysql2/promise';
import { config } from '../config';

// El build incluye SQL dentro de dist; en desarrollo se usa apps/api/migrations.
// Ambas rutas se resuelven desde el módulo, independientemente del cwd del hosting.
const packagedMigrations = path.join(__dirname, '..', 'migrations');
const MIGRATIONS_DIR = existsSync(packagedMigrations)
  ? packagedMigrations
  : path.join(__dirname, '..', '..', 'migrations');

export async function runMigrations(): Promise<string[]> {
  const { host, port, user, password, database } = config.db;
  let admin: mysql.Connection;
  try {
    admin = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      multipleStatements: true,
    });
  } catch {
    // Si la BD aún no existe, conectamos sin base de datos específica
    admin = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });
  }
  try {
    try {
      await admin.query(
        `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    } catch {
      // Ignorar si el usuario no tiene permisos globales de CREATE DATABASE (habitual en Hostinger)
    }
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
