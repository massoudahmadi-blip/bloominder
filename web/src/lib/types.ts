export type PropertyType = 'Maison' | 'Appartement' | 'Terrain' | 'Local' | 'Autre';

export interface Sale {
  id: string | number;
  id_mutation: string;
  date: string; // ISO yyyy-mm-dd
  prix: number; // valeur_fonciere (€)
  type: PropertyType | null;
  prix_m2: number | null;
  adresse?: string;
  nom_commune?: string;
  code_postal?: string;
  code_commune?: string;
  surface_bati?: number | null;
  nb_pieces?: number | null;
  surface_terrain?: number | null;
  resale_pct?: number | null; // realized gain vs the previous sale of the same property
  resale_prev_date?: string | null;
  dpe?: string | null; // DPE energy class A–G of the nearest matched diagnostic
  longitude: number;
  latitude: number;
}

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface Filters {
  type: PropertyType | 'all';
  minPrice?: number;
  maxPrice?: number;
  from?: string; // ISO date
  to?: string;
  minSurface?: number;
  maxSurface?: number;
  minLand?: number;
  maxLand?: number;
  dpe?: string; // energy class A–G
}

export interface YearTrend {
  annee: number;
  ventes: number;
  median_eur_m2: number | null;
}

export interface CommuneRow {
  code_commune: string;
  nom_commune: string;
  code_departement: string;
  ventes_total: number;
  median_prix_m2: number | null;
  median_prix_m2_appartement: number | null;
  median_prix_m2_maison: number | null;
  prix_m2_growth_3y: number | null;
  loyer_m2_appartement: number | null;
  rendement_brut_appartement: number | null;
  rendement_brut_maison: number | null;
  score_global: number | null;
  score_yield: number | null;
  score_growth: number | null;
  score_demand: number | null;
  pct_passoire: number | null;
  resale_gain: number | null;
  taxe_fonciere: number | null;
  airbnb_nightly: number | null;
}

export type ScreenerSort =
  | 'score_global'
  | 'rendement_brut_appartement'
  | 'prix_m2_growth_3y'
  | 'median_prix_m2'
  | 'ventes_total';

export interface ScreenerParams {
  dept?: string;
  postal?: string;
  minYield?: number;
  minScore?: number;
  q?: string;
  sort?: ScreenerSort;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CommuneProfile {
  metrics: {
    code_commune: string;
    nom_commune: string;
    code_departement: string;
    ventes_total: number;
    ventes_12m: number | null;
    median_prix_m2: number | null;
    median_prix_m2_appartement: number | null;
    median_prix_m2_maison: number | null;
    prix_m2_growth_3y: number | null;
    loyer_m2_appartement: number | null;
    loyer_m2_maison: number | null;
    rendement_brut_appartement: number | null;
    rendement_brut_maison: number | null;
    p25_prix_m2: number | null;
    p75_prix_m2: number | null;
    median_days_to_sell: number | null;
  };
  scores: {
    score_yield: number | null;
    score_growth: number | null;
    score_demand: number | null;
    score_global: number | null;
  } | null;
  dpe: { dpe_total: number; pct_passoire: number | null; pct_abc: number | null } | null;
  resale: { resales: number; median_gain_pct: number | null; median_annualized: number | null } | null;
  demo: { population: number | null; pop_growth: number | null; median_income: number | null } | null;
  tax: { taux_tfb: number | null; taux_th: number | null; thrs_major: string | null } | null;
  airbnb: {
    listings: number;
    median_nightly: number | null;
    pct_entire: number | null;
    median_occupancy: number | null;
    median_revenue_year: number | null;
  } | null;
  risk: { seismic_zone: string | null; risks: string | null; icpe_count: number | null; seveso_count: number | null } | null;
  livability: { schools: number | null; ecoles: number | null; colleges: number | null; lycees: number | null; education_prioritaire: boolean | null; crime_rate: number | null } | null;
  benchmark: { dept: number | null; fr: number | null };
  valeur_verte: { classe: string; ventes: number; median_eur_m2: number | null }[];
}
