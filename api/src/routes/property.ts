import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';

// Property detail + comparables — powers the address detail page.
export async function propertyRoutes(app: FastifyInstance) {
  // GET /api/property/:idMutation  — all lines of a single sale (a sale can span lots/parcels)
  app.get('/property/:idMutation', async (req, reply) => {
    const { idMutation } = req.params as { idMutation: string };
    const rows = await query(
      `SELECT id, id_mutation, date_mutation, nature_mutation, valeur_fonciere,
              adresse, code_postal, code_commune, nom_commune, id_parcelle,
              type_local, surface_bati, nb_pieces, surface_terrain, prix_m2,
              longitude, latitude
       FROM transactions
       WHERE id_mutation = $1
       ORDER BY type_local NULLS LAST`,
      [idMutation],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'not found' });
    return { id_mutation: idMutation, lines: rows };
  });

  // GET /api/mutation?code=13105&date=2022-07-08&valeur=900000
  // The full composition of ONE sale (mutation): every lot/parcel/local it
  // bundled. A mutation can repeat the full price across rows, so it's keyed by
  // the natural key (code_commune, date, valeur) — works for every year, unlike
  // id_mutation which is per-row in the raw national files.
  const MutationQuery = z.object({
    code: z.string(),
    date: z.string(),
    valeur: z.coerce.number(),
  });

  app.get('/mutation', async (req, reply) => {
    const parsed = MutationQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query' });
    const { code, date, valeur } = parsed.data;

    const lines = await query<{
      id: number; type_local: string | null; surface_bati: string | null;
      surface_carrez: string | null; surface_terrain: string | null; nb_pieces: number | null;
      id_parcelle: string | null; section: string | null; no_plan: string | null; dpe: string | null;
    }>(
      `SELECT t.id, t.type_local, t.surface_bati, t.surface_carrez, t.surface_terrain, t.nb_pieces,
              t.id_parcelle, t.section, t.no_plan, td.etiquette_dpe AS dpe
       FROM transactions t
       LEFT JOIN transaction_dpe td ON td.transaction_id = t.id
       WHERE t.code_commune = $1 AND t.date_mutation = $2 AND t.valeur_fonciere = $3
       ORDER BY coalesce(NULLIF(t.surface_carrez,0), t.surface_bati) DESC NULLS LAST`,
      [code, date, valeur],
    );

    const num = (v: string | number | null) => (v == null ? 0 : Number(v));
    // One group per category (Maison / Appartement / Dépendance / Terrain / …).
    const cat = new Map<string, { type: string; count: number; surface_bati: number; surface_carrez: number; surface_terrain: number; pieces: number }>();
    const parcels = new Set<string>();
    for (const l of lines) {
      const c = l.type_local || (num(l.surface_terrain) > 0 ? 'Terrain' : 'Autre');
      const g = cat.get(c) ?? { type: c, count: 0, surface_bati: 0, surface_carrez: 0, surface_terrain: 0, pieces: 0 };
      g.count += 1;
      g.surface_bati += num(l.surface_bati);
      g.surface_carrez += num(l.surface_carrez);
      g.surface_terrain += num(l.surface_terrain);
      g.pieces = Math.max(g.pieces, l.nb_pieces ?? 0);
      cat.set(c, g);
      if (l.id_parcelle) parcels.add(l.id_parcelle);
    }
    const ORDER = ['Maison', 'Appartement', 'Local', 'Dépendance', 'Terrain', 'Autre'];
    const composition = [...cat.values()].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    const habBati = composition.filter((c) => c.type === 'Maison' || c.type === 'Appartement')
      .reduce((s, c) => s + (c.surface_carrez > 0 ? c.surface_carrez : c.surface_bati), 0);

    return {
      valeur, date, code_commune: code,
      n_lines: lines.length,
      parcels: [...parcels],
      surface_terrain_total: composition.reduce((s, c) => s + c.surface_terrain, 0),
      surface_hab_total: habBati,
      prix_m2: habBati > 8 ? Math.round(valeur / habBati) : null,
      composition,
      lines,
    };
  });

  // GET /api/parcel/:idParcelle  — full sale history for a cadastral parcel
  app.get('/parcel/:idParcelle', async (req) => {
    const { idParcelle } = req.params as { idParcelle: string };
    const rows = await query(
      `SELECT id, id_mutation, date_mutation, valeur_fonciere, adresse,
              type_local, surface_bati, nb_pieces, prix_m2
       FROM transactions
       WHERE id_parcelle = $1
       ORDER BY date_mutation DESC`,
      [idParcelle],
    );
    return { id_parcelle: idParcelle, history: rows };
  });

  // GET /api/comparables?lat=43.67&lon=4.62&radius=500&type=Maison&limit=50
  // Nearby recent sales for the "what's it worth" comparables block.
  const CompQuery = z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    radius: z.coerce.number().min(50).max(5000).default(500), // metres
    type: z.string().optional(),
    months: z.coerce.number().int().min(6).max(240).default(24), // starting recency window
    min: z.coerce.number().int().min(1).max(100).default(15),    // expand the window until we have this many
    limit: z.coerce.number().int().min(1).max(200).default(50),
  });

  app.get('/comparables', async (req, reply) => {
    const parsed = CompQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid query', details: parsed.error.issues });
    }
    const q = parsed.data;

    // Start at the requested window (default 2 years); if fewer than `min`
    // comparable sales, widen to 3, 4, 5, then 10 years until we have enough.
    const windows = [q.months, 36, 48, 60, 120].filter((w) => w >= q.months);
    let rows: Array<Record<string, unknown>> = [];
    let usedMonths = q.months;
    for (const w of windows) {
      const params: unknown[] = [q.lon, q.lat, q.radius];
      let typeClause = '';
      if (q.type) { params.push(q.type); typeClause = `AND type_local = $${params.length}`; }
      params.push(w);
      const sinceClause = `AND date_mutation >= ((SELECT max(date_mutation) FROM transactions) - ($${params.length} || ' months')::interval)`;
      params.push(q.limit);
      rows = await query(
        `SELECT id, id_mutation, date_mutation, valeur_fonciere, adresse,
                type_local, surface_bati, nb_pieces, prix_m2,
                round(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)) AS metres
         FROM transactions
         WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
           ${typeClause} ${sinceClause}
         ORDER BY date_mutation DESC, metres ASC
         LIMIT $${params.length}`,
        params,
      );
      usedMonths = w;
      if (rows.length >= q.min) break;
    }
    return { center: { lat: q.lat, lon: q.lon }, radius: q.radius, months: usedMonths, comparables: rows };
  });
}
