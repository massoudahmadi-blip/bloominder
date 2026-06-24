import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Commune risk profile from the Géorisques API (GASPAR) — the "état des risques"
// list shown on the address report (flood, clay shrink-swell, seismicity, etc.).
const GR = 'https://www.georisques.gouv.fr/api/v1';
const Query = z.object({ code_insee: z.string().min(5) });
const cache = new Map<string, Promise<any>>();

async function grJson(path: string): Promise<any> {
  const res = await fetch(`${GR}${path}`, { headers: { 'User-Agent': 'Bloominder/1.0', Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function risquesRoutes(app: FastifyInstance) {
  app.get('/risques/commune', async (req, reply) => {
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'code_insee required' });
    const code = parsed.data.code_insee;

    let p = cache.get(code);
    if (!p) {
      p = (async () => {
        const data = await grJson(`/gaspar/risques?code_insee=${code}&page=1&page_size=50`);
        const detail: any[] = data?.data?.[0]?.risques_detail ?? [];
        // Keep the top-level risk families (2-digit num_risque) for a clean list;
        // fall back to everything if the coding differs.
        const top = detail.filter((d) => String(d.num_risque ?? '').length <= 2);
        const list = (top.length ? top : detail).map((d) => ({
          code: d.num_risque ?? null,
          libelle: d.libelle_risque_long ?? null,
        })).filter((d) => d.libelle);
        const seismic = detail.map((d) => d.zone_sismicite).find((z) => z != null) ?? null;
        return { code_insee: code, risks: list, seismic_zone: seismic };
      })().catch(() => ({ code_insee: code, risks: [], seismic_zone: null }));
      cache.set(code, p);
      if (cache.size > 1000) cache.delete(cache.keys().next().value as string);
    }
    return p;
  });
}
