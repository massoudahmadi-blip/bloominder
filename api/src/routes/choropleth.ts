import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';
import { REGION_DEPTS } from '../regions';

// Département → région (INSEE) for aggregating dept values to regions.
const DEPT_REGION: Record<string, string> = {};
for (const [region, depts] of Object.entries(REGION_DEPTS)) for (const d of depts) DEPT_REGION[d] = region;

function median(xs: number[]): number | null {
  const a = xs.filter((n) => n != null).sort((p, q) => p - q);
  return a.length ? Math.round(a[Math.floor(a.length / 2)]) : null;
}

// Choropleth values by département or région, for price (€/m²) or rent (€/m²/mo).
export async function choroplethRoutes(app: FastifyInstance) {
  const Q = z.object({
    level: z.enum(['commune', 'dept', 'region']).default('dept'),
    metric: z.enum(['price', 'rent']).default('price'),
    ptype: z.enum(['maison', 'appartement']).default('appartement'),
    dept: z.string().optional(), // required for level=commune
  });

  app.get('/choropleth', async (req, reply) => {
    const parsed = Q.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query' });
    const { level, metric, ptype, dept } = parsed.data;

    // Commune level: per-commune values within one department.
    if (level === 'commune') {
      if (!dept) return { level, metric, ptype, values: [] };
      let rows: { code: string; value: number }[];
      if (metric === 'rent') {
        const col = ptype === 'maison' ? 'loyer_m2_maison' : 'loyer_m2_appartement';
        rows = await query<{ code: string; value: number }>(
          `SELECT code_commune AS code, round(${col}::numeric, 1) AS value
           FROM rents_commune WHERE substr(code_commune,1,2) = $1 AND ${col} IS NOT NULL`, [dept],
        ).catch(() => []);
      } else {
        const col = ptype === 'maison' ? 'median_prix_m2_maison' : 'median_prix_m2_appartement';
        rows = await query<{ code: string; value: number }>(
          `SELECT code_commune AS code, ${col} AS value
           FROM commune_metrics WHERE code_departement = $1 AND ${col} IS NOT NULL`, [dept],
        ).catch(() => []);
      }
      return { level, metric, ptype, dept, values: rows.map((r) => ({ code: r.code, value: Number(r.value) })) };
    }

    let deptVals: { code: string; value: number }[];
    if (metric === 'rent') {
      // Rent €/m²/mo by department, from Carte des loyers.
      const col = ptype === 'maison' ? 'loyer_m2_maison' : 'loyer_m2_appartement';
      deptVals = await query<{ code: string; value: number }>(
        `SELECT substr(code_commune,1,2) AS code,
                round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${col})::numeric, 1) AS value
         FROM rents_commune WHERE ${col} IS NOT NULL
         GROUP BY 1`,
      ).catch(() => []);
    } else {
      // Median sale €/m² by department, by property type.
      const col = ptype === 'maison' ? 'median_prix_m2_maison' : 'median_prix_m2_appartement';
      deptVals = await query<{ code: string; value: number }>(
        `SELECT code_departement AS code,
                round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${col})) AS value
         FROM commune_metrics WHERE ${col} IS NOT NULL AND code_departement IS NOT NULL
         GROUP BY code_departement`,
      ).catch(() => []);
    }
    deptVals = deptVals.map((d) => ({ code: d.code, value: Number(d.value) }));

    if (level === 'dept') return { level, metric, ptype, values: deptVals };

    // Aggregate dept medians up to régions.
    const byRegion: Record<string, number[]> = {};
    for (const d of deptVals) {
      const r = DEPT_REGION[d.code];
      if (!r) continue;
      (byRegion[r] ??= []).push(d.value);
    }
    const values = Object.entries(byRegion)
      .map(([code, vals]) => ({ code, value: median(vals) }))
      .filter((x) => x.value != null);
    return { level, metric, ptype, values };
  });
}
