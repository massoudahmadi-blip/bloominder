import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db';

// Département → région (INSEE) for aggregating dept values to regions.
const DEPT_REGION: Record<string, string> = {};
const REGION_DEPTS: Record<string, string[]> = {
  '84': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  '27': ['21', '25', '39', '58', '70', '71', '89', '90'],
  '53': ['22', '29', '35', '56'],
  '24': ['18', '28', '36', '37', '41', '45'],
  '94': ['2A', '2B'],
  '44': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  '32': ['02', '59', '60', '62', '80'],
  '11': ['75', '77', '78', '91', '92', '93', '94', '95'],
  '28': ['14', '27', '50', '61', '76'],
  '75': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  '76': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  '52': ['44', '49', '53', '72', '85'],
  '93': ['04', '05', '06', '13', '83', '84'],
  '01': ['971'], '02': ['972'], '03': ['973'], '04': ['974'], '06': ['976'],
};
for (const [region, depts] of Object.entries(REGION_DEPTS)) for (const d of depts) DEPT_REGION[d] = region;

function median(xs: number[]): number | null {
  const a = xs.filter((n) => n != null).sort((p, q) => p - q);
  return a.length ? Math.round(a[Math.floor(a.length / 2)]) : null;
}

// Choropleth values by département or région, for price (€/m²) or rent (€/m²/mo).
export async function choroplethRoutes(app: FastifyInstance) {
  const Q = z.object({
    level: z.enum(['dept', 'region']).default('dept'),
    metric: z.enum(['price', 'rent']).default('price'),
    ptype: z.enum(['maison', 'appartement']).default('appartement'),
  });

  app.get('/choropleth', async (req, reply) => {
    const parsed = Q.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query' });
    const { level, metric, ptype } = parsed.data;

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
