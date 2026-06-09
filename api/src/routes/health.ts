import { FastifyInstance } from 'fastify';
import { query } from '../db';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    let db = 'down';
    try {
      await query('SELECT 1');
      db = 'ok';
    } catch (err) {
      app.log.error(err);
    }
    return { status: 'ok', db };
  });
}
