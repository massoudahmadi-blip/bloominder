# Requirements — French Real-Estate Sold-Price Portal

> A "HAR.com for France": look up what any property sold for, see prices on a map,
> get an estimate of what a home is worth today, and (later) browse listings.
> Built on French government open data (DVF), hosted on IONOS.

**Status:** Requirements draft v1 · **Date:** 2026-06-09
**Brand:** **Bloominder** · domain **bloominder.com**
**Hosting:** IONOS VPS **Linux L+** (6 vCore / 8 GB RAM / 240 GB NVMe) — chosen as the MVP sweet spot; upgradable to XL+ later.

---

## 1. Vision & positioning

Build the friendliest, fastest way for the French public — especially **buyers** — to
answer "**how much did this house sell for, and what is it worth now?**" using official
government transaction data, with an HAR.com-style experience (map-first search, rich
property pages, market trends, and eventually listings and agents).

**Differentiator vs. the existing free government map (app.dvf.etalab.gouv.fr):**
better UX, instant address search, price estimates, market trends, bilingual FR/EN,
mobile-friendly, and SEO-driven discoverability. The government tool is a raw data viewer;
this is a consumer product.

**Business model:** free for users, revenue from **advertising** (display ads + real-estate
advertisers). Implication: **traffic is the product** → SEO and shareability are first-class
requirements, not afterthoughts.

---

## 2. The data foundation (DVF)

- **Source:** DVF — *Demandes de Valeurs Foncières*, published by DGFiP / Etalab on
  data.gouv.fr. Free, open license (Licence Ouverte / Etalab).
- **Coverage:** all notarized property sales, ~2014 → present.
- **Refresh:** updated **twice a year** (≈ April & October). Pipeline must re-ingest on each release.
- **Per-transaction fields:** sale date, sale price (€), address (street number + name),
  commune + INSEE code, postal code, property type (house / apartment / land / commercial /
  dependency), surface area (m²), number of main rooms, cadastral parcel reference, lot info.
- **Known gaps (must be communicated in the UI):**
  - **No data** for Alsace, Moselle (Bas-Rhin, Haut-Rhin, Moselle), and Mayotte — these use the
    *livre foncier*, not the cadastre. → MVP scope is "mainland France **minus** these departments."
  - No photos, no interior condition, no descriptions — DVF is transactional only.
  - Some records are aggregated/multi-lot, which can distort raw price/m². Cleaning required.
- **Scale:** order of tens of millions of rows over the full history → needs a real database
  with geospatial + text indexing, not a flat file or basic shared-hosting MySQL.

**Supporting free government data to integrate:**
- **BAN** (Base Adresse Nationale) — free address autocomplete + geocoding API.
- **IGN Géoplateforme** — free French map tiles & cadastral parcel layers.
- **INSEE** — commune codes, demographics, for neighborhood profiles & trends.
- Optional later: DPE (energy ratings, ADEME open data), schools (Éducation Nationale),
  crime stats (SSMSI), transport.

---

## 3. Scope & phased roadmap

The full portal is the destination; we ship in phases so something useful is live early.

### Phase 1 — MVP (the lean, fast launch)
The core that makes the product worth visiting.
- [ ] DVF ingestion pipeline → clean, geocoded database (mainland France).
- [ ] **Address search** with autocomplete (BAN-powered).
- [ ] **Interactive map search** (★ #1 priority) — pan/zoom, sales as points/clusters, click for detail.
- [ ] **Property detail page** — sale history for an address/parcel, price, €/m², surface, type, date.
- [ ] **Price estimate** for a given address (key feature — see §5).
- [ ] Basic market stats per commune/neighborhood (median €/m², volume).
- [ ] Bilingual FR/EN.
- [ ] Responsive (mobile web works), SEO-ready, ad slots in place.

### Phase 2 — Engagement & growth
- [ ] **Market trends & charts** — €/m² over time by city/neighborhood/property type.
- [ ] **Neighborhood profiles** — schools, transport, demographics, crime.
- [ ] User accounts: save searches, favorite areas, **price-drop / new-sale alerts** (email).
- [ ] Programmatic SEO landing pages (per city, per street, per type) for organic traffic.
- [ ] Richer estimate model.

### Phase 3 — The full HAR-style portal
- [ ] **Active for-sale listings** (see §6 — sourcing is a separate decision; scraping is risky).
- [ ] **Agent / agency directory.**
- [ ] Lead generation (connect buyers ↔ agents) — potential second revenue stream.
- [ ] **Native mobile apps** (iOS + Android).

---

## 4. Functional requirements (detailed)

### 4.1 Search
- Address search with type-ahead (BAN), tolerant of typos/partial input.
- Search by commune, postal code, or department.
- **Map search:** draw/zoom an area → see all sales in view; cluster at low zoom.
- Filters: date range, price range, property type, surface range, rooms, €/m² range.
- Sort: most recent, price asc/desc, €/m².

### 4.2 Map (★ top priority)
- Full-screen interactive map (MapLibre GL + IGN/French tiles).
- Clustered markers; color/intensity by price or €/m².
- Click marker → mini-card → full property page.
- Cadastral parcel overlay (optional toggle, IGN layer).
- "Search this area" as the user pans.

### 4.3 Property / address detail page
- All recorded sales for that address or parcel, newest first.
- Per sale: price, date, €/m², surface, rooms, type.
- **Estimated current value** + confidence indicator + how it was computed.
- Nearby comparable sales (same street / radius).
- Local stats: median €/m², trend vs. last year.
- Clear disclaimers: data source, gaps, estimate is indicative only.
- Share + clean SEO URL (e.g. `/ventes/{dept}/{commune}/{rue}`).

### 4.4 Market trends
- €/m² time series by commune / neighborhood / property type.
- Transaction volume over time. Median vs. mean. Year-over-year %.

### 4.5 Neighborhood profiles (Phase 2+)
- Demographics (INSEE), schools, transport, crime, points of interest.

### 4.6 Accounts & alerts (Phase 2+)
- Email/social signup. Save searches & favorites. Email alerts for new sales / estimate changes.

### 4.7 Listings (Phase 3) — see §6.

### 4.8 Admin / back-office
- Monitor & trigger DVF ingestion. Data-quality dashboard. Ad/content management. Basic analytics.

---

## 5. Price estimation (key feature)

Goal: "What is this home worth **today**?" from DVF comparables.

- **MVP approach:** comparable-sales / €-per-m² model — take recent nearby sales of the same
  property type, adjust to current date using the local €/m² trend, multiply by the subject's surface.
- **Phase 2 approach:** a proper statistical/ML model (e.g. gradient-boosted regression on
  location, type, surface, rooms, recency) trained per region. Likely a **Python batch job**
  (pandas / scikit-learn) that writes results the API serves — kept separate from the web stack.
- **Always show:** a confidence/uncertainty range, the comparables used, and a disclaimer.
  This is an *indication*, not an appraisal (matters for trust **and** liability).

---

## 6. Listings sourcing (Phase 3) — flagged risk

Owner's current preference: **scraping**. ⚠️ This carries real risk:
- Portals' (SeLoger, Leboncoin, Bien'ici…) **terms of service forbid** automated collection.
- French case law has **ruled against scrapers** (e.g. *Entreparticuliers v. Leboncoin*).
- **GDPR exposure** — listings contain personal data.
- **Fragile & high-maintenance** — breaks on site changes; sites actively block bots.

**Architecture decision to de-risk:** treat the listing *source* as a swappable adapter behind a
common internal format. We can begin with a scraping adapter if you insist, but the system must
let us drop in **legal partner feeds** (portal APIs, agency software exports like Apimo/Hektor,
or direct agency uploads) **without a rewrite**, and scraping stays isolated so it can never take
down sold-price/estimate features. **This remains an open decision to revisit before Phase 3.**

---

## 7. Non-functional requirements

- **Performance:** address & map search feel instant (<300 ms typical). Geospatial + text indexes mandatory.
- **SEO (critical for ad revenue):** server-rendered pages, clean URLs, sitemaps, structured data
  (schema.org), fast Core Web Vitals, programmatic city/street pages.
- **Bilingual:** full FR/EN i18n across UI, URLs, and SEO metadata.
- **Mobile-first responsive** now; native apps later share the same API.
- **Legal/compliance:** GDPR (cookie consent for ads/analytics, privacy policy, no exposing
  personal data beyond what DVF lawfully publishes), correct DVF attribution (Licence Ouverte),
  clear disclaimers on estimates and data gaps. Mentions légales required (French law).
- **Reliability:** twice-yearly data refresh must not cause downtime (ingest to staging, then swap).
- **Cost-conscious:** lean MVP on modest IONOS resources; scale up only as traffic grows.

---

## 8. Proposed technical architecture (lean, solo-maintainable, API-first)

API-first so the **website and the future mobile app share one backend**.

| Layer | Recommendation | Why |
|---|---|---|
| **Database** | **PostgreSQL + PostGIS** | Geospatial queries (map/radius), text search, handles tens of millions of rows. The right tool vs. shared MySQL. |
| **Backend API** | **Node.js + TypeScript** (Fastify/NestJS) serving JSON | One language across web+mobile; maintainable solo. |
| **Estimate engine** | **Python batch job** (pandas/scikit-learn) writing results to the DB | Best ML tooling; isolated from the web stack. |
| **Frontend (web)** | **Next.js (React)** with i18n | Server-side rendering = strong SEO (vital for ads); bilingual built-in; shares React skills with future React Native app. |
| **Maps** | **MapLibre GL** + **IGN Géoplateforme** tiles (free) | No per-map-view fees; French official tiles + cadastre. |
| **Geocoding/autocomplete** | **BAN** API (free, government) | Accurate French addresses, no cost. |
| **Hosting** | **IONOS VPS / Cloud Server** (Linux + Docker) | Full control for Postgres/PostGIS + API + Next.js; scriptable. IONOS Deploy Now optionally for the frontend. |
| **Mobile (Phase 3)** | **React Native** (or PWA as a cheap interim) | Reuses the API and much of the React/TS code. |

**Note on IONOS:** basic shared web hosting (PHP/MySQL) is **not sufficient** for this dataset +
geo workload — we want a VPS/Cloud Server (or managed PostgreSQL) tier. (Different from the
PHP+MySQL stack used for the Mas des Figues apps.)

### Data pipeline (the backbone)
1. Download latest DVF release from data.gouv.fr (twice a year).
2. Clean & normalize (dedupe multi-lot rows, sanity-filter outliers, standardize types).
3. Geocode addresses (BAN) → lat/long + parcel.
4. Load into PostGIS staging → validate → swap into production (zero-downtime).
5. Recompute aggregates (median €/m², trends) and estimate-model outputs.

---

## 9. Open questions / decisions still needed

1. ~~**Brand name & domain**~~ — ✅ confirmed: **Bloominder** / bloominder.com.
2. **Listings sourcing** — revisit scraping vs. legal feeds before Phase 3 (see §6).
3. **Estimate disclaimer wording** — get this right for trust + liability.
4. **Ad network** — Google AdSense vs. real-estate-specific advertisers (affects layout/consent).
5. **Pilot vs. full ingest for first deploy** — even though target is all mainland France,
   we may load one region first to test the pipeline cheaply, then scale.
6. **Confirm IONOS plan/tier** available to the owner (VPS/Cloud Server + enough storage).

---

## 10. Suggested first steps (Phase 1 kickoff)

1. ✅ Brand locked: Bloominder / bloominder.com.
2. Provision the IONOS **VPS Linux L+**; install Docker, PostgreSQL + PostGIS.
3. Build the DVF ingestion pipeline; load a pilot department to validate.
4. Prototype the **map search** + **address detail page** against real data.
5. Add the comparable-sales **estimate**.
6. Wire SEO, bilingual i18n, ad slots, consent, legal pages → soft launch.
