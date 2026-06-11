import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';

// GET /api/search?commune=Arles&q=lilas&type=Maison&minPrice=&maxPrice=&from=&to=&page=1
// Filtered, paginated list of sales — powers the results list.
const SearchQuery = z.object({
  q: z.string().optional(),        // free text on address
  commune: z.string().optional(),  // nom_commune contains
  codeCommune: z.string().optional(),
  type: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function searchRoutes(app: FastifyInstance) {
  app.get('/search', async (req, reply) => {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid query', details: parsed.error.issues });
    }
    const q = parsed.data;

    const params: unknown[] = [];
    const where: string[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };

    if (q.q)          add('adresse ILIKE ?', `%${q.q}%`);
    if (q.commune)    add('nom_commune ILIKE ?', `%${q.commune}%`);
    if (q.codeCommune) add('code_commune = ?', q.codeCommune);
    if (q.type)       add('type_local = ?', q.type);
    if (q.minPrice != null) add('valeur_fonciere >= ?', q.minPrice);
    if (q.maxPrice != null) add('valeur_fonciere <= ?', q.maxPrice);
    if (q.from)       add('date_mutation >= ?', q.from);
    if (q.to)         add('date_mutation <= ?', q.to);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (q.page - 1) * q.pageSize;

    // A DVF "mutation" (one sale) can span several rows/lots that repeat the
    // full price. Gather them into one line per sale using the natural key
    // (code_commune, date_mutation, valeur_fonciere) — same as compute_metrics
    // (id_mutation is unique per lot in the raw national load, so unusable here).
    const countParams = [...params];
    const [{ total }] = await query<{ total: string }>(
      `SELECT count(*)::int AS total FROM (
         SELECT 1 FROM transactions ${whereSql}
         GROUP BY code_commune, date_mutation, valeur_fonciere
       ) g`,
      countParams,
    );

    params.push(q.pageSize, offset);
    const rows = await query(
      `WITH base AS (
         SELECT t.*, td.etiquette_dpe AS dpe
         FROM transactions t
         LEFT JOIN transaction_dpe td ON td.transaction_id = t.id
         ${whereSql}
       )
       SELECT min(id) AS id,
              max(id_mutation) AS id_mutation,
              date_mutation, code_commune, valeur_fonciere,
              max(nom_commune) AS nom_commune,
              max(code_postal) AS code_postal,
              (array_agg(adresse    ORDER BY surface_bati DESC NULLS LAST) FILTER (WHERE adresse IS NOT NULL))[1]    AS adresse,
              (array_agg(type_local ORDER BY surface_bati DESC NULLS LAST) FILTER (WHERE type_local IS NOT NULL))[1] AS type_local,
              sum(surface_bati)    AS surface_bati,
              NULLIF(sum(nb_pieces), 0) AS nb_pieces,
              sum(surface_terrain) AS surface_terrain,
              CASE WHEN sum(surface_bati) > 5 AND valeur_fonciere > 0
                   THEN round(valeur_fonciere / sum(surface_bati)) END AS prix_m2,
              avg(longitude) AS longitude,
              avg(latitude)  AS latitude,
              max(dpe) AS dpe
       FROM base
       GROUP BY code_commune, date_mutation, valeur_fonciere
       ORDER BY date_mutation DESC, valeur_fonciere DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      page: q.page,
      pageSize: q.pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / q.pageSize),
      results: rows,
    };
  });
}
