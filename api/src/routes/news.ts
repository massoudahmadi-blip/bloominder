import { FastifyInstance } from 'fastify';
import { query } from '../db';

// Local news per commune from Google News RSS (public). We return headlines +
// links (not full text) with a lightweight positive/negative keyword tag.
// An LLM-based classification/summary is a planned upgrade.
const POS = ['gare', 'tram', 'métro', 'metro', 'parc', 'école', 'ecole', 'université', 'universite',
  'hôpital', 'hopital', 'commerce', 'ouvre', 'ouverture', 'investiss', 'rénovat', 'renovat', 'emploi',
  'entreprise', 'implant', 'aménage', 'amenage', 'piscine', 'médiathèque', 'mediatheque', 'inaugur'];
const NEG = ['ferme', 'fermeture', 'pollution', 'friche', 'délinqu', 'delinqu', 'inondation',
  'plan social', 'licenci', 'squat', 'insécur', 'insecur', 'fraude', 'incendie'];

function tagOf(title: string): 'pos' | 'neg' | 'neutral' {
  const t = title.toLowerCase();
  if (NEG.some((w) => t.includes(w))) return 'neg';
  if (POS.some((w) => t.includes(w))) return 'pos';
  return 'neutral';
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

export async function newsRoutes(app: FastifyInstance) {
  app.get('/news/:code', async (req) => {
    const { code } = req.params as { code: string };
    const [c] = await query<{ nom_commune: string }>(
      `SELECT nom_commune FROM commune_metrics WHERE code_commune = $1`,
      [code],
    );
    const nom = c?.nom_commune;
    if (!nom) return { commune: null, items: [] };

    const q = encodeURIComponent(`"${nom}" (projet OR gare OR usine OR entreprise OR immobilier OR commerce OR école OR université OR aménagement)`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'bloominder/1.0' } });
      const xml = await res.text();
      const items: { title: string; link: string; date: string; source: string; tag: string }[] = [];
      const re = /<item>([\s\S]*?)<\/item>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) && items.length < 8) {
        const b = m[1];
        const title = decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
        const link = decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
        const date = ((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '').trim();
        const source = decode((b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '');
        if (title) items.push({ title, link, date, source, tag: tagOf(title) });
      }
      return { commune: nom, items };
    } catch {
      return { commune: nom, items: [] };
    }
  });
}
