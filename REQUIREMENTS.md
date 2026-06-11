# Requirements — Bloominder

> **Investment-intelligence platform for French real estate.**
> Rank and score markets for investment potential, drill from city → neighborhood →
> address, model deals, and generate investor-grade reports — all built on official
> open data, hosted on IONOS. A free consumer "what did it sell for?" layer feeds a
> paid investor membership.

**Status:** Requirements v2 (investor pivot) · **Date:** 2026-06-10
**Brand:** **Bloominder** · **bloominder.com** · **Live:** site + API on IONOS VPS, HTTPS via Caddy.

> v1 (consumer ad-portal) is superseded by this investor-SaaS spec. The live map, API, and
> national DVF load remain the foundation; this document defines what we build on top.

---

## 1. Positioning & audience

**Model:** Investor SaaS **+ free consumer funnel.**
- **Free tier (funnel):** all-France sold-price lookups + a basic city view. Drives SEO traffic and signups.
- **Paid tiers:** investment scoring, multi-city screening, deal modeling, reports, alerts, mobile.

**Primary audience:** property **investors** — from solo buy-to-let/Airbnb operators to pros
(agents, brokers, *marchands de biens*, wealth advisors). Goal: **help them identify where to
invest and justify why**, then produce a stunning report for a chosen market or property.

**Strategies served (all four, phased):** long-term rental yield · short-term/seasonal (Airbnb) ·
renovation/flip · buy-and-hold (capital appreciation).

**Differentiator:** the official tools (app.dvf.etalab.gouv.fr) and consumer sites (immo-data.fr)
answer *"what is it worth?"*. **None answers *"where should I invest, and why?"*** — no yield,
demand signals, growth trends, cross-city ranking, or investor reports. That is Bloominder's wedge.

**Languages:** FR + EN (foreign investors are a real segment).

---

## 2. Data sources (almost entirely legal open data)

| Domain | Source | Use | Refresh |
|---|---|---|---|
| Sold prices (transaction) | **DVF** (DGFiP/Etalab) + raw historical (cquest) | prices, €/m², history, geocoded map | 2×/yr |
| Sold prices (aggregated) | **CEREMA DVF+** (commune level) | ready-made commune benchmarks | ~yearly |
| Long-term rents | **Carte des loyers** (gouv/ANIL) | indicative rent €/m² → **yield** | ~yearly |
| Short-term lets | **Inside Airbnb** (public, major cities) | listings, nightly price, occupancy proxy, regulation | ~monthly |
| Demographics/economy | **INSEE** — Geo API (population, ✅ done) + **census "base communale"** (age groups, socio-professional categories/CSP, tenure owners-vs-renters, **% social housing/HLM** via RPLS, **% secondary residences**, education, employment) + **Filosofi** (median income) | demand fundamentals, growth, social profile of a market | yearly |
| Supply pipeline | **Sit@del2** (building permits), **LOVAC** (vacancy) | supply/demand signal | yearly |
| **Local taxes** | **DGFiP fiscalité directe locale** (REI) | taxe foncière (TFPB) + taxe d'habitation résidences secondaires (THRS) rates → yield calculator + "tax burden by city" | yearly |
| Livability / risk | schools (Éduc. Nat.), transport (GTFS/IGN), crime (SSMSI), energy (**DPE**/ADEME), flood/risk (**Géorisques**), POIs (OSM) | "avantages / inconvénients" | varies |
| **Local context: risks** | **Géorisques** (ICPE/SEVESO industrial sites, waste/incineration), **BASOL/BASIAS** (polluted soils) | negative catalysts (pollution, nuisances) near a property/commune | yearly |
| **Local context: catalysts** | large **building permits** (Sit@del2), transit projects, new schools/employers; **news feed** (Google News RSS) + LLM classification | positive/negative local "events" (new station, mall, factory, company arrival/closure) explaining potential | continuous |
| Geocoding / addresses | **BAN** | address autocomplete + lat/lon | continuous |
| **Cadastre** | **Etalab cadastre** (cadastre.data.gouv.fr) — parcelles GeoJSON (geometry + contenance/area) | land area for house reports, **parcel polygon on the map**, and grouping same-mutation lots to fix multi-lot €/m² inflation | periodic |
| Map tiles | CARTO (now) → IGN Géoplateforme | basemap | — |

⚠️ **Short-let policy:** use **Inside Airbnb only** (legal public datasets). **No direct Airbnb/portal
scraping** (ToS + GDPR + fragility). Coverage limited to cities Inside Airbnb publishes; flagged in UI.
Known data gap persists: **no DVF for Alsace, Moselle, Mayotte.**

---

## 3. The core object — City Investment Profile

Each analyzed market gets a profile, **drillable: commune → neighborhood (INSEE IRIS) → address.**

**Prices & sales** — median €/m² (house/apt), 1/3/5-yr growth, transaction volume & velocity, price dispersion.
**Repeat-sales appreciation** — when the *same property* (same cadastral parcel) sold more than once, the **realized % gain between sales** + annualized rate + years held. Shown on the property detail/map popup ("sold +X% since 20YY") and aggregated as a commune metric (median realized resale gain) + on the screener. Derived from DVF parcels — no new data source. Caveat: cross-period matching depends on parcel-id consistency; flagged as indicative.
**Long-term rental** — indicative rent €/m², **gross & net yield**, rental tension.
**Short-let** — active listings, median nightly rate, est. occupancy/RevPAR, **regulation flags** (e.g. Paris 120-night limit, registration/`changement d'usage`).
**Demand & demographics** — population (✅) + 5-yr growth, median income, **age structure** (groupes d'âge), **socio-professional mix (CSP)**, **% social housing (HLM)**, **% secondary residences**, tenure (owners vs renters), students, employment.
**Supply pipeline** — building permits trend, vacancy rate.
**Livability ("avantages / inconvénients")** — schools, transport access, crime, energy/DPE, flood-&-risk zones, plus **proximity to coast, universities, hospitals, beaches/ski, fiber/broadband**, amenities.
**Local tax burden** — taxe foncière (TFPB) rate + THRS rate (secondary residences / short-let), compared across cities and fed into the yield/deal calculator.
**Local context — catalysts & risks** — nearby/incoming projects that move value: ✅ positive (new train station/transit, mall, amusement park, school, university, hospital, major employer arriving, big developments via permits) and ⚠️ negative (polluting/SEVESO industry, waste/incineration plant, flood/risk zones, company closures). Structured from Géorisques/permits + a news feed (LLM-classified) per commune.

---

## 4. Scoring model

- **Bloominder Score** (0–100) per area — a transparent composite of normalized sub-scores.
- **Sub-scores** per strategy: **Yield · Growth · Short-let · Flip** — each 0–100.
- **User-tunable weights:** ship sensible defaults, but let members re-weight signals to match
  their strategy ("my criteria"). Saved per user.
- **Transparency:** always show the *drivers* (which factors push a score up/down) — investors
  trust explainable scores, not black boxes.
- **Methodology:** normalize each signal across the analyzed universe (percentile/z-score),
  weight, aggregate; recompute on each data refresh. Document the formula publicly (trust + SEO).

---

## 5. Features

### Funnel (free)
- All-France **address sold-price lookup** + map (live today).
- One basic **city snapshot** (teaser of the paid profile).

### Investor (paid)
- **City screener / ranking:** filter & sort 200+ markets by any metric or score; compare.
- **City / neighborhood / address profiles** with all of §3 + scores + drivers + charts.
- **Estimates:** price estimate + **rent estimate** per address (from comparables + Carte des loyers).
- **Deal calculator:** purchase price + costs (notaire, works, furnishing) + financing →
  cash flow, net yield, cap rate, ROI, break-even; per strategy (LT rental / Airbnb / flip).
- **Watchlists, saved searches, alerts** (new sale, price/score change, new permit).
- **Report builder:** interactive shareable **dashboard** + branded **PDF**; **white-label** (Pro).
- **Mobile "near me":** GPS centers the map on where you stand → surrounding sold prices, rents,
  yields, scores. Delivered as **PWA first, then native iOS + Android** (shared API).

### Admin / data
- Ingestion orchestration & data-quality dashboard; score recompute; membership/billing ops.

---

## 6. Membership & pricing (draft — to validate)

| Tier | Price (draft) | For | Includes |
|---|---|---|---|
| **Free** | €0 | funnel | all-France sold-price lookups, 1 basic city view |
| **Investisseur** | **~€29/mo** (≈€290/yr) | solo investors | full scores, unlimited cities/addresses, yield + deal calculator, watchlists/alerts, 5 reports/mo |
| **Pro** | **~€99/mo** (≈€990/yr) | agents, advisors, *marchands de biens* | white-label PDF, CSV/API exports, short-let analytics, unlimited reports, multi-seat |

- **Annual ≈ 2 months free; 14-day trial on paid tiers.**
- **Payments: Stripe** (EU subscriptions + SCA). Prices are placeholders pending validation.

---

## 7. Phased roadmap

**Phase A — Investor MVP (next):** finish **national DVF load** + CEREMA commune aggregates;
ingest **Carte des loyers** → yield; build **city screener + profiles + scores** (sales / rent /
demographics). Covers long-term-rental, buy-&-hold, and screening. All-France lookups; deep
scoring on the **first 200 hotspots**.
**Phase B — Monetize:** deal calculator, watchlists/alerts, **report builder (dashboard + PDF)**,
**Stripe membership** gating, neighborhood (IRIS) drill-down.
**Phase C — Strategy depth:** **short-let** analytics (Inside Airbnb) + **flip** signals
(DPE, price gaps, vacancy); white-label reports.
**Phase D — Mobile:** **PWA "near me"** → native iOS + Android.
Expand scoring beyond 200 cities over time.

---

## 8. Technical additions (on the existing stack)

Existing: PostgreSQL+PostGIS · Node/TS API (Fastify) · Next.js+MapLibre · Caddy/HTTPS · Docker on IONOS VPS.
**Add:**
- **Data warehouse tables** for each source + a derived `city_profile` / `area_metrics` / `scores` schema.
- **Batch jobs** (Python) for ingestion, geocoding, aggregation, and **score computation** (scheduled).
- **Auth + billing:** user accounts, Stripe subscriptions, plan-based feature gating.
- **Report service:** server-rendered dashboard + **headless-browser PDF** (e.g. Playwright) with white-label theming.
- **PWA**: installable, offline-light, geolocation; later **React Native** apps sharing the API.
- **Caching/precompute** of scores & profiles (the 200 cities) for instant screening.
- Likely VPS upgrade (L+ → XL+) as data volume + compute grow.

---

## 9. The "first 200 cities"

Selected **algorithmically** (size + yield + growth + tourism blend) into a candidate list the
owner **reviews/adjusts before** full profiles are computed. Scoring then expands beyond 200 over time.

---

## 10. Legal & compliance
GDPR (consent, privacy policy, no personal data beyond lawful DVF), DVF/CEREMA Licence Ouverte
attribution, Inside Airbnb licensing/attribution, **no direct portal/Airbnb scraping**, clear
"indicative — not an appraisal" disclaimers on estimates/scores, French *mentions légales* + CGV/CGU.

---

## 11b. Report enhancement backlog (banker / investor / buyer)

Goal: an "astonishing" report. Marked (have)=from current data, (new)=needs an ingest.
- **Banker:** AVM valuation + confidence + comps (have); market liquidity / délai-de-vente from DPE→sale date (have); price volatility/dispersion (have); DSCR + LTV + amortization + rate stress test (have); environmental risk register / ERP — flood, clay shrink-swell, seismic, radon, SEVESO, polluted soil (new: Géorisques); energy rental-ban timeline G2025/F2028/E2034 (have: DPE).
- **Investor:** in-report cash-flow + 10-yr projection/IRR + scenario & sensitivity (have); realized appreciation + trend (have); short-let deep-dive + Airbnb regulation 120-night/changement d'usage (have+rules); renovation/flip thesis + valeur-verte gap + MaPrimeRénov (have+rules); fiscal sim LMNP/LMP, micro vs réel, Pinel/Denormandie/déficit foncier, plus-value resale tax (new: rules/logic); rent control / encadrement zones (new: list); supply pipeline permits+vacancy (new: Sit@del2/LOVAC).
- **Buyer:** fair-price verdict + €/m² percentile (have); livability — schools+IPS, transport, crime, healthcare, amenities, fiber (new: ÉducNat/GTFS/SSMSI/FINESS/OSM/ARCEP); demographics depth + income + affordability/price-to-income (new: richer INSEE+Filosofi); env risks (new: Géorisques).
- **Wow:** LLM-written investment thesis; peer comparison city vs dept vs national vs similar cities (have); maps in report incl cadastral parcel + land area (new: cadastre); methodology & data-freshness page (have).

Recommended sequencing: **Report v2 from existing data first** (comps, liquidity, volatility, peer comparison, rental-ban timeline + reno upside, financing/DSCR summary, auto-narrative, methodology) → then new open-data layers (Géorisques risks, livability, richer INSEE/income, supply, rent control, fiscal sim, cadastre).

## 11c. Filters & search backlog (user request)

- **Screener:** city-name ✅ (done) · department code ✅ · **postal code** (add code_postal to commune_metrics) · **department name** (name→code lookup) · ⚠️ **transaction date-range** not directly applicable to precomputed commune aggregates — would need windowed metrics (e.g. 12m/3y variants) or applies only at map/drill-down level.
- **Map search:** **date range** (API /api/map already supports from/to — add UI) · **surface habitable** min/max · **land size** (surface_terrain) min/max · **DPE class** (join transaction_dpe) — all need /api/map params + filter UI.
- **Data quality:** many DVF rows lack surface/rooms (land, dependencies, partial records) — surface/DPE filters naturally exclude them; flag in UI. **Multi-lot mutations** (rows that are one sale) → grouping fix via cadastre/id_mutation dedup (already queued §11/cadastre).

## 12. UX + address-report + stats batch (user, 2026-06-11)
- **Map**: on address search, drop the point ON the cadastre and **highlight the parcel/land** (IGN WFS GetFeature by point → polygon); auto-enable parcels overlay + zoom.
- **Default map window** = last **complete 6 months** of transactions.
- **Floating filters panel** (HAR-style: search bar + Price/Beds/Baths/Type/Filters chips → slide-over panel).
- **Redesign**: more modern/premium; 2 candidate themes (Éditorial-Light vs Dark-Fintech).
- **DVF statistics page**: distributions by city/region/property type; **top-10s** (most sales, biggest € volume, highest repeat-sale turnover, etc.).
- **Deeper multi-lot gather**: group rows of the same sale (use id_mutation where real; commune+date+valeur fallback already in compute) — extend to display (collapse drill-down rows into one sale).
- **Address-level report / estimate** (AVM): address search → full report = position in France → cadastre/parcel → exact address + all DVF details → city commodities (schools, crime, population, age, transactions last yr, 2/5-yr change, income, €/m², overall score) → estimate w/ confidence + comps. Doubles as a valuation doc to convince a buyer.

## 11. Open items to confirm
- Pricing tiers/amounts, trial length, annual discount (defaults in §6).
- Competitor tools the owner wants benchmarked (send links).
- Final livability factor set + default weights (defaults in §3).
- Approval of the algorithmic 200-city list (§9).
- Confirm Inside-Airbnb-only short-let stance (§2).
