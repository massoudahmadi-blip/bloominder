import { FastifyInstance } from 'fastify';
import { query } from '../db';

// Lightweight metadata: latest transaction date (used to default the map window).
export async function metaRoutes(app: FastifyInstance) {
  app.get('/meta', async () => {
    const [r] = await query<{ max_date: string | null }>(
      `SELECT max(date_mutation)::text AS max_date FROM transactions`,
    );
    return { maxDate: r?.max_date ?? null };
  });
}
