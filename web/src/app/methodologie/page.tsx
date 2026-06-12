'use client';

import { useI18n } from '@/lib/i18n';
import { SubNav } from '@/components/SubNav';
import { usePageTitle } from '@/lib/useTitle';

interface Src { name: string; use: { fr: string; en: string }; fresh: { fr: string; en: string } }

const SOURCES: Src[] = [
  { name: 'DVF (DGFiP / Etalab)', use: { fr: 'Prix de vente réels, €/m², historique, plus-values', en: 'Real sale prices, €/m², history, gains' }, fresh: { fr: 'semestriel, ~6 mois de décalage', en: 'biannual, ~6-month lag' } },
  { name: 'DPE (ADEME)', use: { fr: 'Classe énergie, valeur verte, interdiction de location', en: 'Energy class, green value, rental ban' }, fresh: { fr: 'continu', en: 'continuous' } },
  { name: 'Carte des loyers (DHUP)', use: { fr: 'Loyers de marché, rendement', en: 'Market rents, yield' }, fresh: { fr: 'annuel', en: 'annual' } },
  { name: 'INSEE (population, Filosofi)', use: { fr: 'Population, revenu médian, accessibilité', en: 'Population, median income, affordability' }, fresh: { fr: 'annuel', en: 'annual' } },
  { name: 'DGFiP fiscalité (REI)', use: { fr: 'Taxe foncière', en: 'Property tax' }, fresh: { fr: 'annuel', en: 'annual' } },
  { name: 'Géorisques', use: { fr: 'Risques naturels & industriels (Seveso, inondation…)', en: 'Natural & industrial risks (Seveso, flood…)' }, fresh: { fr: 'continu', en: 'continuous' } },
  { name: 'INSEE BPE / Éducation / SSMSI / ARCEP', use: { fr: 'Écoles, santé, transports, criminalité, fibre', en: 'Schools, health, transport, crime, fibre' }, fresh: { fr: 'annuel', en: 'annual' } },
  { name: 'Encadrement des loyers (Ville de Paris)', use: { fr: 'Loyers de référence par quartier (Paris)', en: 'Reference rents by quartier (Paris)' }, fresh: { fr: 'annuel', en: 'annual' } },
  { name: 'Zones tendues (DILA / service-public)', use: { fr: 'Location courte durée, TLV', en: 'Short-term rental, vacancy tax' }, fresh: { fr: 'par décret', en: 'by decree' } },
  { name: 'BAN / IGN Géoplateforme', use: { fr: 'Géocodage, fond de carte, cadastre', en: 'Geocoding, basemap, cadastre' }, fresh: { fr: 'continu', en: 'continuous' } },
];

export default function MethodologiePage() {
  const { t, locale } = useI18n();
  usePageTitle(t.methoTitle);
  const fr = locale === 'fr';

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <SubNav active="methodo" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.methoTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.methoIntro}</p>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.methoSources}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t.methoColSource}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t.methoColUse}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t.methoColFresh}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {SOURCES.map((s) => (
                  <tr key={s.name}>
                    <td className="px-2 py-1.5 font-medium text-slate-700">{s.name}</td>
                    <td className="px-2 py-1.5 text-slate-600">{fr ? s.use.fr : s.use.en}</td>
                    <td className="px-2 py-1.5 text-slate-500">{fr ? s.fresh.fr : s.fresh.en}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.methoLimitsTitle}</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            {(fr ? METHO_LIMITS_FR : METHO_LIMITS_EN).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </section>

        <p className="mt-4 text-[11px] text-slate-400">{t.methoDisclaimer}</p>
      </main>
    </div>
  );
}

const METHO_LIMITS_FR = [
  'L’estimation d’un bien repose sur les ventes comparables récentes (même type, ~2 ans, rayon 800 m) — fiabilité indiquée selon le nombre de comparables. Les locaux commerciaux et terrains sont hétérogènes : estimation seulement indicative.',
  'Les regroupements de ventes multi-lots utilisent la clé (commune, date, prix) faute d’identifiant de mutation fiable sur l’historique.',
  'L’impôt sur la plus-value et le régime LMNP (réintégration des amortissements, LF 2025) sont modélisés de façon simplifiée — hors SCI, déficit foncier, cas particuliers.',
  'La capacité d’emprunt applique la règle HCSF (35 %, 25 ans) ; les banques peuvent déroger pour ~20 % des dossiers.',
  'L’encadrement des loyers couvre Paris ; d’autres villes seront ajoutées. La location courte durée est estimée à partir de la population, du département et d’une liste de villes tendues — à vérifier en mairie.',
  'La « liquidité » est approchée par le délai entre le DPE et la vente, faute de durée réelle de mise en marché dans DVF.',
];
const METHO_LIMITS_EN = [
  'A property estimate is based on recent comparable sales (same type, ~2 years, 800 m radius) — reliability shown by comparable count. Commercial premises and land are heterogeneous: indicative only.',
  'Multi-lot sales are grouped by (commune, date, price) since the historical data lacks a reliable mutation identifier.',
  'Capital-gains tax and the LMNP regime (amortization reintegration, LF 2025) are modelled in a simplified way — excluding SCI, déficit foncier and edge cases.',
  'Borrowing capacity applies the HCSF rule (35%, 25 years); banks may derogate for ~20% of files.',
  'Rent control covers Paris; more cities will follow. Short-term-rental rules are inferred from population, department and a curated list of tense cities — verify with the town hall.',
  '“Liquidity” is proxied by the EPC-to-deed delay, since DVF has no true time-on-market.',
];
