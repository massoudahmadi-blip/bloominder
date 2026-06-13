import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { REGION_DEPTS } from '../regions';

// Market stats — powers trend charts and neighborhood summaries.
export async function statsRoutes(app: FastifyInstance) {
  // Interactive explore: aggregates recomputed for a year/region/dept/commune
  // scope. byYear ignores the year filter (it's the trend/selector); the other
  // series apply all filters. Mutation-grain (multi-lot dedup).
  const ExploreQuery = z.object({
    year: z.coerce.number().int().optional(),
    region: z.string().optional(),
    dept: z.string().optional(),
    commune: z.string().optional(),
  });
  app.get('/stats/explore', async (req, reply) => {
    const parsed = ExploreQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query' });
    const q = parsed.data;

    const geo: string[] = [];
    const geoParams: unknown[] = [];
    if (q.commune) { geoParams.push(q.commune); geo.push(`code_commune = $${geoParams.length}`); }
    else if (q.dept) { geoParams.push(q.dept); geo.push(`code_departement = $${geoParams.length}`); }
    else if (q.region) { geoParams.push(REGION_DEPTS[q.region] ?? []); geo.push(`code_departement = ANY($${geoParams.length})`); }

    // mut CTE builder for a given extra filter (geo + optional year).
    const run = async <T>(withYear: boolean, select: string, groupOrder: string): Promise<T[]> => {
      const params = [...geoParams];
      const conds = [`nature_mutation = 'Vente'`, `valeur_fonciere > 0`, ...geo];
      if (withYear && q.year) { params.push(q.year); conds.push(`extract(year FROM date_mutation) = $${params.length}`); }
      return query<T>(
        `WITH mut AS (
           SELECT code_departement, date_mutation, valeur_fonciere,
             (array_agg(type_local ORDER BY surface_bati DESC NULLS LAST))[1] AS type_local,
             CASE WHEN sum(surface_bati) > 5 THEN valeur_fonciere / sum(surface_bati) END AS prix_m2
           FROM transactions WHERE ${conds.join(' AND ')}
           GROUP BY code_commune, code_departement, date_mutation, valeur_fonciere
         ) ${select} FROM mut ${groupOrder}`,
        params,
      );
    };

    const [byYear, byType, byMonth, priceBands, byDept, totals] = await Promise.all([
      run<{ annee: number; ventes: number; volume: number; median_m2: number | null }>(false,
        `SELECT extract(year FROM date_mutation)::int AS annee, count(*) AS ventes, round(sum(valeur_fonciere)) AS volume,
                round(percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 BETWEEN 400 AND 25000)) AS median_m2`,
        `WHERE extract(year FROM date_mutation) >= 2014 GROUP BY annee ORDER BY annee`),
      run<{ type: string; ventes: number; median_m2: number | null }>(true,
        `SELECT COALESCE(NULLIF(type_local,''),'Terrain/Autre') AS type, count(*) AS ventes,
                round(percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 BETWEEN 400 AND 25000)) AS median_m2`,
        `GROUP BY type ORDER BY ventes DESC LIMIT 8`),
      run<{ mois: number; ventes: number }>(true,
        `SELECT extract(month FROM date_mutation)::int AS mois, count(*) AS ventes`, `GROUP BY mois ORDER BY mois`),
      run<{ ord: number; label: string; ventes: number }>(true,
        `SELECT b.ord, b.label, count(*) AS ventes`,
        `CROSS JOIN LATERAL (SELECT
            CASE WHEN valeur_fonciere<100000 THEN 1 WHEN valeur_fonciere<200000 THEN 2 WHEN valeur_fonciere<300000 THEN 3
                 WHEN valeur_fonciere<500000 THEN 4 WHEN valeur_fonciere<1000000 THEN 5 ELSE 6 END AS ord,
            CASE WHEN valeur_fonciere<100000 THEN '< 100 k€' WHEN valeur_fonciere<200000 THEN '100–200 k€'
                 WHEN valeur_fonciere<300000 THEN '200–300 k€' WHEN valeur_fonciere<500000 THEN '300–500 k€'
                 WHEN valeur_fonciere<1000000 THEN '500 k–1 M€' ELSE '> 1 M€' END AS label) b
         GROUP BY b.ord, b.label ORDER BY b.ord`),
      run<{ dept: string; ventes: number; median_m2: number | null }>(true,
        `SELECT code_departement AS dept, count(*) AS ventes,
                round(percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 BETWEEN 400 AND 25000)) AS median_m2`,
        `GROUP BY code_departement ORDER BY ventes DESC LIMIT 15`),
      run<{ ventes: number; volume: number }>(true,
        `SELECT count(*) AS ventes, round(sum(valeur_fonciere)) AS volume`, ``),
    ]);

    return {
      byYear, byType, byMonth, priceBands, byDept,
      totals: totals[0] ?? { ventes: 0, volume: 0 },
    };
  });

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
      byYear: map.by_year ?? [],
      byMonth: map.by_month ?? [],
      priceBands: map.price_bands ?? [],
      affordability: map.affordability ?? null,
      liquidity: map.liquidity ?? null,
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
