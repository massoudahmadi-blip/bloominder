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

    const countParams = [...params];
    const [{ total }] = await query<{ total: string }>(
      `SELECT count(*)::int AS total FROM transactions ${whereSql}`,
      countParams,
    );

    params.push(q.pageSize, offset);
    const rows = await query(
      `SELECT t.id, t.id_mutation, t.date_mutation, t.valeur_fonciere, t.adresse,
              t.code_postal, t.nom_commune, t.type_local, t.surface_bati, t.nb_pieces,
              t.prix_m2, t.longitude, t.latitude, td.etiquette_dpe AS dpe
       FROM transactions t
       LEFT JOIN transaction_dpe td ON td.transaction_id = t.id
       ${whereSql}
       ORDER BY t.date_mutation DESC
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
