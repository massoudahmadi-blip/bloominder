import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';

// Rent control (encadrement des loyers): is an address in a controlled zone,
// and what is the reference / majored / minored rent for its profile?
export async function rentControlRoutes(app: FastifyInstance) {
  const Q = z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    rooms: z.coerce.number().int().min(1).max(4).optional(),
    furnished: z.coerce.boolean().optional(),
    epoch: z.string().optional(),
  });

  app.get('/rent-control', async (req, reply) => {
    const parsed = Q.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query' });
    const q = parsed.data;

    const [zone] = await query<{ name: string; city: string; zone_ref: string }>(
      `SELECT name, city, zone_ref FROM rent_control_zone
       WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) LIMIT 1`,
      [q.lon, q.lat],
    );
    if (!zone) return { controlled: false };

    const rooms = q.rooms ?? 2;
    const furnished = q.furnished ?? false;
    const params: unknown[] = [zone.zone_ref, rooms, furnished];
    let epochClause = '';
    if (q.epoch) { params.push(q.epoch); epochClause = `AND epoch = $${params.length}`; }

    // Average across epochs when the caller doesn't know the building's age.
    const [ref] = await query<{ ref: number; majored: number; minored: number; year: number }>(
      `SELECT round(avg(ref_eur_m2), 1) AS ref,
              round(avg(ref_majored_eur_m2), 1) AS majored,
              round(avg(ref_minored_eur_m2), 1) AS minored,
              max(year) AS year
       FROM rent_control_ref
       WHERE zone_ref = $1 AND rooms = $2 AND furnished = $3 ${epochClause}`,
      params,
    );

    if (!ref || ref.majored == null) {
      return { controlled: true, zone: zone.name, city: zone.city, ref: null };
    }
    return {
      controlled: true, zone: zone.name, city: zone.city, rooms, furnished,
      ref: Number(ref.ref), majored: Number(ref.majored), minored: Number(ref.minored), year: ref.year,
    };
  });
}
