import { FastifyInstance } from 'fastify';
import { query } from '../db';

// Market stats — powers trend charts and neighborhood summaries.
export async function statsRoutes(app: FastifyInstance) {
  // National DVF statistics + top-10s for the /stats page.
  app.get('/stats', async () => {
    const rows = await query<{ key: string; data: unknown }>(`SELECT key, data FROM stats`);
    const map: Record<string, any> = {};
    for (const r of rows) map[r.key] = r.data;
    const topSales = await query(
      `SELECT code_commune, nom_commune, code_departement, ventes_total
       FROM commune_metrics ORDER BY ventes_total DESC NULLS LAST LIMIT 10`,
    );
    const topVolume = await query(
      `SELECT code_commune, nom_commune, code_departement, volume_total
       FROM commune_metrics WHERE volume_total IS NOT NULL ORDER BY volume_total DESC LIMIT 10`,
    );
    const topTurnover = await query(
      `SELECT cr.code_commune, m.nom_commune, m.code_departement, cr.resales, cr.median_gain_pct
       FROM commune_resale cr JOIN commune_metrics m USING (code_commune)
       WHERE m.ventes_total >= 50 ORDER BY cr.resales DESC LIMIT 10`,
    );
    return {
      totals: map.totals ?? null,
      byType: map.by_type ?? [],
      byDept: Array.isArray(map.by_dept) ? map.by_dept.slice(0, 15) : [],
      topSales, topVolume, topTurnover,
    };
  });

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
