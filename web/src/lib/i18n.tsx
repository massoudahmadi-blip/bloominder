'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Locale = 'fr' | 'en';

const dict = {
  fr: {
    tagline: 'Prix de l’immobilier en France',
    searchPlaceholder: 'Rechercher une adresse, une ville…',
    listTab: 'Liste',
    mapTab: 'Carte',
    results: 'ventes',
    noResults: 'Aucune vente dans cette zone',
    noResultsHint: 'Déplacez la carte ou élargissez vos filtres.',
    filters: 'Filtres',
    type: 'Type de bien',
    allTypes: 'Tous',
    Maison: 'Maison',
    Appartement: 'Appartement',
    Terrain: 'Terrain',
    Local: 'Local',
    price: 'Prix',
    period: 'Période',
    minPrice: 'Prix min',
    maxPrice: 'Prix max',
    apply: 'Appliquer',
    reset: 'Réinitialiser',
    soldOn: 'Vendu le',
    pricePerM2: 'Prix au m²',
    surface: 'Surface',
    rooms: 'Pièces',
    land: 'Terrain',
    estimate: 'Estimation',
    estimateValue: 'Valeur estimée aujourd’hui',
    estimateNote: 'Estimation indicative basée sur les ventes comparables. Ce n’est pas une évaluation officielle.',
    comparables: 'Ventes comparables à proximité',
    trend: 'Évolution du prix au m²',
    saleHistory: 'Historique de la vente',
    away: 'à',
    close: 'Fermer',
    legendTitle: 'Prix au m²',
    legendNoData: 'Non renseigné',
    demoBanner: 'Démo — données d’exemple (PACA). Connectez l’API pour les données réelles.',
    dataSource: 'Source : DVF (data.gouv.fr) · Bloominder',
  },
  en: {
    tagline: 'French property sold prices',
    searchPlaceholder: 'Search an address or town…',
    listTab: 'List',
    mapTab: 'Map',
    results: 'sales',
    noResults: 'No sales in this area',
    noResultsHint: 'Move the map or widen your filters.',
    filters: 'Filters',
    type: 'Property type',
    allTypes: 'All',
    Maison: 'House',
    Appartement: 'Apartment',
    Terrain: 'Land',
    Local: 'Commercial',
    price: 'Price',
    period: 'Period',
    minPrice: 'Min price',
    maxPrice: 'Max price',
    apply: 'Apply',
    reset: 'Reset',
    soldOn: 'Sold on',
    pricePerM2: 'Price per m²',
    surface: 'Surface',
    rooms: 'Rooms',
    land: 'Land',
    estimate: 'Estimate',
    estimateValue: 'Estimated value today',
    estimateNote: 'Indicative estimate from comparable sales. Not an official appraisal.',
    comparables: 'Comparable sales nearby',
    trend: 'Price per m² over time',
    saleHistory: 'Sale details',
    away: 'away',
    close: 'Close',
    legendTitle: 'Price per m²',
    legendNoData: 'Not available',
    demoBanner: 'Demo — sample data (Provence). Connect the API for real data.',
    dataSource: 'Source: DVF (data.gouv.fr) · Bloominder',
  },
} as const;

export type Dict = typeof dict.fr;

const I18nContext = createContext<{ locale: Locale; t: Dict; setLocale: (l: Locale) => void }>({
  locale: 'fr',
  t: dict.fr,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr');

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('locale')) as Locale | null;
    if (saved === 'fr' || saved === 'en') setLocaleState(saved);
    else if (typeof navigator !== 'undefined' && navigator.language.startsWith('en')) setLocaleState('en');
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== 'undefined') localStorage.setItem('locale', l);
    document.documentElement.lang = l;
  };

  return (
    <I18nContext.Provider value={{ locale, t: dict[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
