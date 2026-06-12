// Short-term-rental (meublé de tourisme / Airbnb) regulation signal.
// No single open dataset exists (it's national rules + per-commune choices),
// so we flag the "strict" tier — communes legally subject to changement
// d'usage / compensation: >200k inhabitants, Paris & petite couronne (75/92/
// 93/94), plus a curated set of tense tourist cities — and otherwise surface
// the national baseline (120-day primary-residence cap, registration, DPE).

// Curated INSEE codes of well-known tense tourist communes under reinforced
// rules, beyond those caught automatically by population/department.
const STRICT_CODES = new Set<string>([
  '06088', '06029', '06004', '06083', '06027', // Nice, Cannes, Antibes, Menton, Cagnes
  '64122', '64102', '64024', '64483', '64125', '64260', // Biarritz, Bayonne, Anglet, St-Jean-de-Luz, Bidart, Hendaye
  '74010', '74056', // Annecy, Chamonix
  '17300', // La Rochelle
  '35288', '35093', // Saint-Malo, Dinard
  '33009', '33529', // Arcachon, La Teste-de-Buch
  '13001', // Aix-en-Provence
  '83119', '83061', // Saint-Tropez, Hyères
  '34301', // Sète
  '14333', '14220', // Honfleur, Deauville
  '84007', // Avignon
  '73065', // Chambéry
  '2A004', // Ajaccio
]);

export interface StrRule {
  strict: boolean;
  dayCap: number; // primary-residence annual cap (days)
}

export function shortTermRule(code: string | null | undefined, population: number | null | undefined): StrRule {
  const dept = (code ?? '').slice(0, 2);
  const strict =
    (population ?? 0) > 200000 ||
    ['75', '92', '93', '94'].includes(dept) ||
    (code ? STRICT_CODES.has(code) : false);
  return { strict, dayCap: 120 };
}
