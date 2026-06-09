import { FastifyInstance } from 'fastify';
import { query } from '../db';

// Market stats — powers trend charts and neighborhood summaries.
export async function statsRoutes(app: FastifyInstance) {
  // GET /api/stats/commune/:codeCommune
  // Median price/m2 by property type + total volume for a commune.
  app.get('/stats/commune/:codeCommune', async (req, reply) => {
    const { codeCommune } = req.params as { codeCommune: string };

    const byType = await query(
      `SELECT type_local,
              count(*)::int AS ventes,
              round(percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2)) AS median_eur_m2,
              round(avg(valeur_fonciere)) AS prix_moyen
       FROM transactions
       WHERE code_commune = $1 AND prix_m2 IS NOT NULL
       GROUP BY type_local
       ORDER BY ventes DESC`,
      [codeCommune],
    );

    if (byType.length === 0) return reply.code(404).send({ error: 'no data for commune' });
    return { code_commune: codeCommune, by_type: byType };
  });

  // GET /api/stats/trend/:codeCommune?type=Maison
  // Median price/m2 per year — for the trend chart.
  app.get('/stats/trend/:codeCommune', async (req) => {
    const { codeCommune } = req.params as { codeCommune: string };
    const { type } = req.query as { type?: string };

    const params: unknown[] = [codeCommune];
    let typeClause = '';
    if (type) { params.push(type); typeClause = `AND type_local = $${params.length}`; }

    const rows = await query(
      `SELECT extract(year FROM date_mutation)::int AS annee,
              count(*)::int AS ventes,
              round(percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2)) AS median_eur_m2
       FROM transactions
       WHERE code_commune = $1 AND prix_m2 IS NOT NULL ${typeClause}
       GROUP BY annee
       ORDER BY annee`,
      params,
    );
    return { code_commune: codeCommune, type: type ?? 'all', trend: rows };
  });
}
