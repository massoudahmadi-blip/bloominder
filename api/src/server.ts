import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { pool } from './db';
import { healthRoutes } from './routes/health';
import { mapRoutes } from './routes/map';
import { searchRoutes } from './routes/search';
import { propertyRoutes } from './routes/property';
import { statsRoutes } from './routes/stats';
import { screenerRoutes } from './routes/screener';

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
  });

  await app.register(healthRoutes);
  await app.register(mapRoutes, { prefix: '/api' });
  await app.register(searchRoutes, { prefix: '/api' });
  await app.register(propertyRoutes, { prefix: '/api' });
  await app.register(statsRoutes, { prefix: '/api' });
  await app.register(screenerRoutes, { prefix: '/api' });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Bloominder API listening on :${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

async function shutdown() {
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void main();
