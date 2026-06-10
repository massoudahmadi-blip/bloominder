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
| Demographics/economy | **INSEE** (population, Filosofi income, employment, tenure) | demand fundamentals & growth | yearly |
| Supply pipeline | **Sit@del2** (building permits), **LOVAC** (vacancy) | supply/demand signal | yearly |
| **Local taxes** | **DGFiP fiscalité directe locale** (REI) | taxe foncière (TFPB) + taxe d'habitation résidences secondaires (THRS) rates → yield calculator + "tax burden by city" | yearly |
| Livability / risk | schools (Éduc. Nat.), transport (GTFS/IGN), crime (SSMSI), energy (**DPE**/ADEME), flood/risk (**Géorisques**), POIs (OSM) | "avantages / inconvénients" | varies |
| **Local context: risks** | **Géorisques** (ICPE/SEVESO industrial sites, waste/incineration), **BASOL/BASIAS** (polluted soils) | negative catalysts (pollution, nuisances) near a property/commune | yearly |
| **Local context: catalysts** | large **building permits** (Sit@del2), transit projects, new schools/employers; **news feed** (Google News RSS) + LLM classification | positive/negative local "events" (new station, mall, factory, company arrival/closure) explaining potential | continuous |
| Geocoding / addresses | **BAN** | address autocomplete + lat/lon | continuous |
| Map tiles | CARTO (now) → IGN Géoplateforme | basemap | — |

⚠️ **Short-let policy:** use **Inside Airbnb only** (legal public datasets). **No direct Airbnb/portal
scraping** (ToS + GDPR + fragility). Coverage limited to cities Inside Airbnb publishes; flagged in UI.
Known data gap persists: **no DVF for Alsace, Moselle, Mayotte.**

---

## 3. The core object — City Investment Profile

Each analyzed market gets a profile, **drillable: commune → neighborhood (INSEE IRIS) → address.**

**Prices & sales** — median €/m² (house/apt), 1/3/5-yr growth, transaction volume & velocity, price dispersion.
**Long-term rental** — indicative rent €/m², **gross & net yield**, rental tension.
**Short-let** — active listings, median nightly rate, est. occupancy/RevPAR, **regulation flags** (e.g. Paris 120-night limit, registration/`changement d'usage`).
**Demand & demographics** — population + 5-yr growth, median income, owners vs renters, students, employment.
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

## 11. Open items to confirm
- Pricing tiers/amounts, trial length, annual discount (defaults in §6).
- Competitor tools the owner wants benchmarked (send links).
- Final livability factor set + default weights (defaults in §3).
- Approval of the algorithmic 200-city list (§9).
- Confirm Inside-Airbnb-only short-let stance (§2).
