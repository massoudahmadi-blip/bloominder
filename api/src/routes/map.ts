import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';

// GET /api/map?bbox=minLon,minLat,maxLon,maxLat&type=Maison&from=2023-01-01&limit=1000
// Returns a GeoJSON FeatureCollection of sales inside the viewport — powers the map.
const MapQuery = z.object({
  bbox: z.string(),
  type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

export async function mapRoutes(app: FastifyInstance) {
  app.get('/map', async (req, reply) => {
    const parsed = MapQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid query', details: parsed.error.issues });
    }
    const q = parsed.data;
    const box = q.bbox.split(',').map(Number);
    if (box.length !== 4 || box.some(Number.isNaN)) {
      return reply.code(400).send({ error: 'bbox must be "minLon,minLat,maxLon,maxLat"' });
    }

    const params: unknown[] = [box[0], box[1], box[2], box[3]];
    const where = ['geom && ST_MakeEnvelope($1,$2,$3,$4,4326)'];
    if (q.type) { params.push(q.type); where.push(`type_local = $${params.length}`); }
    if (q.from) { params.push(q.from); where.push(`date_mutation >= $${params.length}`); }
    if (q.to)   { params.push(q.to);   where.push(`date_mutation <= $${params.length}`); }
    params.push(q.limit);

    const rows = await query<{
      id: number; id_mutation: string; date_mutation: string;
      valeur_fonciere: string; type_local: string | null; prix_m2: string | null;
      longitude: number; latitude: number;
    }>(
      `SELECT id, id_mutation, date_mutation, valeur_fonciere, type_local, prix_m2,
              longitude, latitude
       FROM transactions
       WHERE ${where.join(' AND ')}
       ORDER BY date_mutation DESC
       LIMIT $${params.length}`,
      params,
    );

    return {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
        properties: {
          id: r.id,
          id_mutation: r.id_mutation,
          date: r.date_mutation,
          prix: Number(r.valeur_fonciere),
          type: r.type_local,
          prix_m2: r.prix_m2 ? Number(r.prix_m2) : null,
        },
      })),
    };
  });
}
