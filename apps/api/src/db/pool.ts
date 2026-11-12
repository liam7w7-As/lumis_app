import mysql from 'mysql2/promise';
import { config } from '../config';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  timezone: 'Z',
  waitForConnections: true,
  connectionLimit: 10,
});

// mysql2 timezone configura la conversión de JavaScript; TIMESTAMP requiere además
// la zona de la sesión SQL para no desplazar fechas si XAMPP/Hostinger usan otra.
pool.on('connection', connection => {
  connection.query("SET time_zone = '+00:00'");
});
