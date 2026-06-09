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
}

export interface YearTrend {
  annee: number;
  ventes: number;
  median_eur_m2: number | null;
}
