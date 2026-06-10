import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';

// City screener + city profile — the core investor views over the commune tables.
const SORTS = [
  'score_global', 'rendement_brut_appartement', 'prix_m2_growth_3y',
  'median_prix_m2', 'ventes_total',
] as const;

const ScreenerQuery = z.object({
  dept: z.string().optional(),
  minVentes: z.coerce.number().optional(),
  minYield: z.coerce.number().optional(),
  minScore: z.coerce.number().optional(),
  q: z.string().optional(), // commune name contains
  sort: z.enum(SORTS).default('score_global'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function screenerRoutes(app: FastifyInstance) {
  app.get('/screener', async (req, reply) => {
    const parsed = ScreenerQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid query', details: parsed.error.issues });
    }
    const q = parsed.data;

    const params: unknown[] = [];
    const where: string[] = ['m.ventes_total >= 5'];
    const add = (clause: string, val: unknown) => {
      params.push(val);
      where.push(clause.replace('?', `$${params.length}`));
    };
    if (q.dept) add('m.code_departement = ?', q.dept);
    if (q.minVentes != null) add('m.ventes_total >= ?', q.minVentes);
    if (q.minYield != null) add('m.rendement_brut_appartement >= ?', q.minYield);
    if (q.minScore != null) add('s.score_global >= ?', q.minScore);
    if (q.q) add('m.nom_commune ILIKE ?', `%${q.q}%`);
    const whereSql = where.join(' AND ');

    const sortCol = q.sort === 'score_global' ? 's.score_global' : `m.${q.sort}`;
    const dir = q.dir === 'asc' ? 'ASC' : 'DESC';

    const [{ total }] = await query<{ total: number }>(
      `SELECT count(*)::int AS total FROM commune_metrics m
       LEFT JOIN commune_scores s USING (code_commune) WHERE ${whereSql}`,
      params,
    );

    params.push(q.pageSize, (q.page - 1) * q.pageSize);
    const results = await query(
      `SELECT m.code_commune, m.nom_commune, m.code_departement, m.ventes_total,
              m.median_prix_m2, m.median_prix_m2_appartement, m.median_prix_m2_maison,
              m.prix_m2_growth_3y, m.loyer_m2_appartement,
              m.rendement_brut_appartement, m.rendement_brut_maison,
              s.score_global, s.score_yield, s.score_growth, s.score_demand,
              cd.pct_passoire
       FROM commune_metrics m
       LEFT JOIN commune_scores s USING (code_commune)
       LEFT JOIN commune_dpe cd USING (code_commune)
       WHERE ${whereSql}
       ORDER BY ${sortCol} ${dir} NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { page: q.page, pageSize: q.pageSize, total: Number(total), results };
  });

  app.get('/commune/:code', async (req, reply) => {
    const { code } = req.params as { code: string };
    const [metrics] = await query(`SELECT * FROM commune_metrics WHERE code_commune = $1`, [code]);
    if (!metrics) return reply.code(404).send({ error: 'not found' });
    const [scores] = await query(
      `SELECT score_yield, score_growth, score_demand, score_global FROM commune_scores WHERE code_commune = $1`,
      [code],
    );
    const [dpe] = await query(
      `SELECT dpe_total, pct_passoire, pct_abc FROM commune_dpe WHERE code_commune = $1`,
      [code],
    );
    const [demo] = await query(
      `SELECT population, pop_growth, median_income FROM commune_demo WHERE code_commune = $1`,
      [code],
    );
    const valeur_verte = await query(
      `SELECT td.etiquette_dpe AS classe, count(*)::int AS ventes,
              round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t.prix_m2)) AS median_eur_m2
       FROM transaction_dpe td JOIN transactions t ON t.id = td.transaction_id
       WHERE t.code_commune = $1 AND t.prix_m2 IS NOT NULL
       GROUP BY td.etiquette_dpe ORDER BY classe`,
      [code],
    );
    return { metrics, scores: scores ?? null, dpe: dpe ?? null, demo: demo ?? null, valeur_verte };
  });
}
