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
  surfaceMin: z.coerce.number().optional(),
  surfaceMax: z.coerce.number().optional(),
  landMin: z.coerce.number().optional(),
  landMax: z.coerce.number().optional(),
  dpe: z.string().optional(),
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
    if (q.surfaceMin != null) { params.push(q.surfaceMin); where.push(`surface_bati >= $${params.length}`); }
    if (q.surfaceMax != null) { params.push(q.surfaceMax); where.push(`surface_bati <= $${params.length}`); }
    if (q.landMin != null) { params.push(q.landMin); where.push(`surface_terrain >= $${params.length}`); }
    if (q.landMax != null) { params.push(q.landMax); where.push(`surface_terrain <= $${params.length}`); }
    if (q.dpe) { params.push(q.dpe); where.push(`td.etiquette_dpe = $${params.length}`); }
    const dpeJoin = q.dpe ? 'LEFT JOIN transaction_dpe td ON td.transaction_id = t.id' : '';

    // Broad viewport → grid-aggregate into clusters (true density everywhere,
    // no truncation). Zoomed in → individual points (national zoom kept as
    // points to avoid a full-table aggregate).
    const span = Math.max(box[2] - box[0], box[3] - box[1]);
    if (span > 0.3 && span < 6) {
      const cell = span / 45;
      const clusters = await query<{ lon: number; lat: number; n: number }>(
        `SELECT avg(t.longitude) AS lon, avg(t.latitude) AS lat, count(*)::int AS n
         FROM transactions t ${dpeJoin}
         WHERE ${where.join(' AND ')} AND t.longitude IS NOT NULL
         GROUP BY round((t.longitude / ${cell}))::int, round((t.latitude / ${cell}))::int
         LIMIT 4000`,
        params,
      );
      return {
        aggregated: true,
        clusters: clusters.map((c) => ({ lon: Number(c.lon), lat: Number(c.lat), count: c.n })),
      };
    }

    params.push(q.limit);

    const rows = await query<{
      id: number; id_mutation: string; date_mutation: string;
      valeur_fonciere: string; type_local: string | null; prix_m2: string | null;
      adresse: string | null; nom_commune: string | null; code_commune: string | null;
      surface_bati: number | null; surface_terrain: number | null; nb_pieces: number | null;
      longitude: number; latitude: number;
      resale_pct: string | null; resale_prev_date: string | null; dpe: string | null;
    }>(
      `SELECT t.id, t.id_mutation, t.date_mutation, t.valeur_fonciere, t.type_local, t.prix_m2,
              t.adresse, t.nom_commune, t.code_commune, t.surface_bati, t.surface_terrain, t.nb_pieces,
              t.longitude, t.latitude, r.change_pct AS resale_pct, r.prev_date AS resale_prev_date,
              td.etiquette_dpe AS dpe
       FROM transactions t
       LEFT JOIN transaction_resale r ON r.transaction_id = t.id
       LEFT JOIN transaction_dpe td ON td.transaction_id = t.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.date_mutation DESC
       LIMIT $${params.length}`,
      params,
    );

    return {
      aggregated: false,
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
          adresse: r.adresse,
          nom_commune: r.nom_commune,
          code_commune: r.code_commune,
          surface_bati: r.surface_bati != null ? Number(r.surface_bati) : null,
          surface_terrain: r.surface_terrain != null ? Number(r.surface_terrain) : null,
          nb_pieces: r.nb_pieces != null ? Number(r.nb_pieces) : null,
          resale_pct: r.resale_pct != null ? Number(r.resale_pct) : null,
          resale_prev_date: r.resale_prev_date,
          dpe: r.dpe,
        },
      })),
    };
  });
}
