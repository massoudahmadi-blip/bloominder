import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Urban-planning (PLU) zoning for an address/parcel, from the Géoportail de
// l'Urbanisme via the IGN apicarto GPU API (built on data.geopf.fr). Returns the
// zonage at a point: zone type (U/AU/A/N), label, the document, règlement file.
const GPU = 'https://apicarto.ign.fr/api/gpu';

const Query = z.object({ lon: z.coerce.number(), lat: z.coerce.number() });

// Light cache keyed by rounded coordinates (zones are large polygons).
const cache = new Map<string, Promise<any>>();

async function gpu(endpoint: string, lon: number, lat: number): Promise<any[]> {
  const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] });
  const url = `${GPU}/${endpoint}?geom=${encodeURIComponent(geom)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => null);
  return (data && data.features) ? data.features : [];
}

// Plain-language family from the PLU zone type.
function family(typezone: string | null): string {
  const t = (typezone || '').toUpperCase();
  if (t.startsWith('AU')) return 'a_urbaniser';
  if (t.startsWith('U')) return 'urbaine';
  if (t.startsWith('A')) return 'agricole';
  if (t.startsWith('N')) return 'naturelle';
  return 'autre';
}

export async function urbanismeRoutes(app: FastifyInstance) {
  app.get('/urbanisme', async (req, reply) => {
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'lon and lat required' });
    const { lon, lat } = parsed.data;
    const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;

    let p = cache.get(key);
    if (!p) {
      p = (async () => {
        const [zonesF, prescF] = await Promise.all([
          gpu('zone-urba', lon, lat),
          gpu('prescription-surf', lon, lat).catch(() => []),
        ]);
        const zones = zonesF.map((f: any) => {
          const z = f.properties || {};
          return {
            typezone: z.typezone ?? null,
            family: family(z.typezone),
            libelle: z.libelle ?? null,
            libelong: z.libelong ?? null,
            partition: z.partition ?? null,
            insee: z.insee ?? null,
            reglement_file: z.nomfic ?? null,
            reglement_url: z.urlfic || null,
            date: z.datappro ?? z.datvalid ?? null,
          };
        });
        const prescriptions = prescF.map((f: any) => {
          const z = f.properties || {};
          return { libelle: z.libelle ?? null, typepsc: z.typepsc ?? null, txt: z.txt ?? null };
        }).filter((x: any) => x.libelle || x.txt);
        return {
          point: { lon, lat },
          has_document: zones.length > 0,
          zones,
          prescriptions,
          gpu_url: `https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=${lon}&lat=${lat}&zoom=18`,
        };
      })().catch(() => ({ point: { lon, lat }, has_document: false, zones: [], prescriptions: [], gpu_url: `https://www.geoportail-urbanisme.gouv.fr/` }));
      cache.set(key, p);
      if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    }
    return p;
  });
}
