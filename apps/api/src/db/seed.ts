import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from './pool';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

interface SeedQuote {
  client: number | null;
  status: 'borrador' | 'aprobada' | 'rechazada' | 'convertida';
  total: number;
  ageDays: number;
}

const DEMO_PRODUCTS: { name: string; price: number }[] = [
  { name: 'Almir', price: 1 },
  { name: 'Aceite de máquina', price: 35 },
  { name: 'Abrazadera metálica de 5/8', price: 3 },
  { name: 'Abrazaderas para tubo 6"', price: 15 },
  { name: 'Aceite penetrante WD 40, 11oz', price: 75 },
  { name: 'Adaptador enchufe triple', price: 20 },
  { name: 'Adaptador para clavija universal', price: 16 },
  { name: 'Adaptador simple', price: 15 },
];

export async function runSeed(): Promise<void> {
  const [users] = await pool.query<RowDataPacket[]>('SELECT id FROM users ORDER BY id LIMIT 1');
  if (users.length === 0) {
    throw new Error('No hay usuarios: regístrate primero desde la app.');
  }
  const userId = users[0].id as number;

  const [existingBusiness] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM business WHERE id = 1',
  );
  if (existingBusiness.length === 0) {
    await pool.query(
      `INSERT INTO business (id, nombre, color_primario, moneda, redes_sociales, website, direccion, ciudad)
       VALUES (1, 'Novaled', '#5842F4', 'Bs.', '@novaledbolivia', 'www.novaledbolivia.com',
         'Calle Isaac Tamayo #818 #840', 'La Paz, Bolivia')`,
    );
    console.log('Seed: perfil del negocio.');
  }

  const [existingBranches] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM branches LIMIT 1',
  );
  if (existingBranches.length === 0) {
    await pool.query(
      'INSERT INTO branches (user_id, name, address) VALUES (?, ?, ?)',
      [userId, 'Sucursal Central', 'Calle Isaac Tamayo #818 #840, La Paz, Bolivia'],
    );
    console.log('Seed: sucursal central.');
  }

  const [existingQuotes] = await pool.query<RowDataPacket[]>('SELECT id FROM quotes LIMIT 1');
  if (existingQuotes.length === 0) {
    const clientIds: number[] = [];
    for (const [name, phone] of [
      ['Ferretería El Tornillo', '777-12345'],
      ['María López', '701-44556'],
      ['Entidad Demo S.R.L.', null],
    ] as const) {
      const [r] = await pool.query<ResultSetHeader>(
        'INSERT INTO clients (user_id, name, phone) VALUES (?, ?, ?)',
        [userId, name, phone],
      );
      clientIds.push(r.insertId);
    }

    const quotes: SeedQuote[] = [
      { client: clientIds[0], status: 'borrador', total: 8641, ageDays: 0 },
      { client: null, status: 'borrador', total: 32.5, ageDays: 0 },
      { client: clientIds[1], status: 'aprobada', total: 7752, ageDays: 3 },
      { client: clientIds[2], status: 'rechazada', total: 0, ageDays: 10 },
      { client: clientIds[0], status: 'convertida', total: 1737, ageDays: 4 },
      { client: null, status: 'borrador', total: 825, ageDays: 34 },
      { client: clientIds[1], status: 'aprobada', total: 1250.75, ageDays: 1 },
    ];

    for (const q of quotes) {
      const [r] = await pool.query<ResultSetHeader>(
        `INSERT INTO quotes (user_id, client_id, status, total, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, q.client, q.status, q.total, daysAgo(q.ageDays)],
      );
      if (q.total > 0) {
        await pool.query(
          `INSERT INTO quote_items (quote_id, description, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [r.insertId, 'Ítem de demostración', 1, q.total, q.total],
        );
      }
    }
    console.log(`Seed: 3 clientes y ${quotes.length} cotizaciones de muestra.`);
  } else {
    console.log('Ya hay cotizaciones, no se insertan más.');
  }

  const [existingProducts] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM products LIMIT 1',
  );
  if (existingProducts.length === 0) {
    for (const p of DEMO_PRODUCTS) {
      await pool.query(
        "INSERT INTO products (user_id, name, price, stock, unit) VALUES (?, ?, ?, 50, 'Unidad')",
        [userId, p.name, p.price],
      );
    }
    console.log(`Seed: ${DEMO_PRODUCTS.length} productos de muestra.`);
  } else {
    console.log('Ya hay productos, no se insertan más.');
  }

  await pool.end();
}

const invokedDirectly =
  process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');

if (invokedDirectly) {
  runSeed().catch((err) => {
    console.error('Error en el seed. ¿Está MySQL de XAMPP en ejecución?');
    console.error(err);
    process.exit(1);
  });
}
