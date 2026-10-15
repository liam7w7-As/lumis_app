import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import { config } from './config';
import { runMigrations } from './db/migrate';
import { errorHandler } from './middlewares/errorHandler';
import { agentsRouter } from './routes/agents';
import { authRouter } from './routes/auth';
import { branchesRouter } from './routes/branches';
import { businessRouter } from './routes/business';
import { clientsRouter } from './routes/clients';
import { dashboardRouter } from './routes/dashboard';
import { healthRouter } from './routes/health';
import { productsRouter } from './routes/products';
import { quotesRouter } from './routes/quotes';
import { salesRouter } from './routes/sales';

async function main() {
  const pending = await runMigrations();
  if (pending.length > 0) {
    console.log(`Migraciones aplicadas: ${pending.join(', ')}`);
  } else {
    console.log('Base de datos al día.');
  }

  fs.mkdirSync(config.uploadsDir, { recursive: true });

  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigin }));
  // La subida de comprobantes (ventas) y de logo/sello (negocio) viaja en
  // base64; esas ramas necesitan más margen que el resto de la API
  // (body-parser no re-parsea si ya se leyó el body).
  app.use('/api/sales', express.json({ limit: '12mb' }));
  app.use('/api/business', express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/uploads', express.static(config.uploadsDir));
  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/business', businessRouter);
  app.use('/api/branches', branchesRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/quotes', quotesRouter);
  app.use('/api/sales', salesRouter);

  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`lumis-api escuchando en http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('No se pudo iniciar la API:');
  console.error(err);
  process.exit(1);
});
