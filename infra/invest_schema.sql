-- Bloominder investor layer (Phase A). Idempotent — safe to run repeatedly.

-- Indicative rents per m²/month by commune (gouv "Carte des loyers").
CREATE TABLE IF NOT EXISTS rents_commune (
  code_commune          text PRIMARY KEY,
  nom_commune           text,
  code_departement      text,
  loyer_m2_appartement  numeric,
  loyer_m2_maison       numeric,
  updated_at            timestamptz DEFAULT now()
);

-- Per-commune market metrics, computed from transactions + rents.
CREATE TABLE IF NOT EXISTS commune_metrics (
  code_commune                text PRIMARY KEY,
  nom_commune                 text,
  code_departement            text,
  ventes_total                int,
  ventes_12m                  int,
  median_prix_m2              numeric,
  median_prix_m2_appartement  numeric,
  median_prix_m2_maison       numeric,
  prix_m2_growth_3y           numeric,   -- % change, recent 12m vs 3y earlier
  loyer_m2_appartement        numeric,
  loyer_m2_maison             numeric,
  rendement_brut_appartement  numeric,   -- gross yield %
  rendement_brut_maison       numeric,
  computed_at                 timestamptz DEFAULT now()
);

-- Investment scores (0–100). Demand for now is a transaction-velocity proxy;
-- it gets richer once INSEE demographics are ingested (Phase A+).
CREATE TABLE IF NOT EXISTS commune_scores (
  code_commune   text PRIMARY KEY,
  score_yield    numeric,
  score_growth   numeric,
  score_demand   numeric,
  score_global   numeric,
  computed_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commune_metrics_dep_idx  ON commune_metrics (code_departement);
CREATE INDEX IF NOT EXISTS commune_scores_global_idx ON commune_scores (score_global DESC);

-- Report v2 additions to commune_metrics (added in-place for existing DBs).
ALTER TABLE commune_metrics ADD COLUMN IF NOT EXISTS p25_prix_m2 numeric;
ALTER TABLE commune_metrics ADD COLUMN IF NOT EXISTS p75_prix_m2 numeric;
ALTER TABLE commune_metrics ADD COLUMN IF NOT EXISTS median_days_to_sell int;  -- DPE→deed liquidity
ALTER TABLE commune_metrics ADD COLUMN IF NOT EXISTS code_postal text;          -- representative postal code
ALTER TABLE commune_metrics ADD COLUMN IF NOT EXISTS volume_total numeric;       -- total € transacted (mutation-level)
ALTER TABLE commune_metrics ADD COLUMN IF NOT EXISTS median_prix_m2_12m numeric;  -- median €/m² over the last 12 months
ALTER TABLE commune_metrics ADD COLUMN IF NOT EXISTS prix_m2_growth_1y numeric;   -- YoY % change in median €/m²

-- Precomputed national stats (distributions, totals) for the /stats page.
CREATE TABLE IF NOT EXISTS stats (
  key         text PRIMARY KEY,
  data        jsonb,
  computed_at timestamptz DEFAULT now()
);

-- Benchmarks for peer comparison (national + per-department median €/m²).
CREATE TABLE IF NOT EXISTS benchmark (
  scope          text,   -- 'FR' or 'DEP'
  code           text,   -- 'FR' or department code
  median_prix_m2 numeric,
  PRIMARY KEY (scope, code)
);

-- ---------------------------------------------------------------------------
-- DPE energy diagnostics (ADEME "dpe03existant", since July 2021).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dpe (
  numero_dpe      text PRIMARY KEY,
  date_dpe        date,
  type_batiment   text,            -- maison / appartement / immeuble
  etiquette_dpe   text,            -- A..G (energy)
  etiquette_ges   text,            -- A..G (greenhouse gas)
  surface         numeric,
  code_commune    text,
  code_postal     text,
  geom            geometry(Point, 4326)
);
CREATE INDEX IF NOT EXISTS dpe_geom_gix    ON dpe USING GIST (geom);
CREATE INDEX IF NOT EXISTS dpe_commune_idx ON dpe (code_commune);

-- Each sale matched to its nearest DPE (vendrebien-style spatial cross-check).
CREATE TABLE IF NOT EXISTS transaction_dpe (
  transaction_id  bigint PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  numero_dpe      text,
  etiquette_dpe   text,
  etiquette_ges   text,
  distance_m      numeric
);
CREATE INDEX IF NOT EXISTS transaction_dpe_label_idx ON transaction_dpe (etiquette_dpe);

-- Short-term rentals (Inside Airbnb, covered cities only).
CREATE TABLE IF NOT EXISTS airbnb_listings (
  id              bigint PRIMARY KEY,
  code_commune    text,
  room_type       text,
  price           numeric,     -- nightly €
  min_nights      int,
  n_reviews       int,
  reviews_per_month numeric,
  availability_365  int,
  neighbourhood   text,
  license         text,
  longitude       double precision,
  latitude        double precision
);
CREATE INDEX IF NOT EXISTS airbnb_commune_idx ON airbnb_listings (code_commune);

-- Per-commune short-let summary (estimated; Inside Airbnb "reviews" occupancy proxy).
CREATE TABLE IF NOT EXISTS commune_airbnb (
  code_commune        text PRIMARY KEY,
  listings            int,
  median_nightly      numeric,   -- entire home/apt
  pct_entire          numeric,
  median_occupancy    numeric,   -- % (estimated)
  median_revenue_year numeric,   -- € (estimated)
  updated_at          timestamptz DEFAULT now()
);

-- Livability / cadre de vie per commune (schools now; crime/health/transport/fiber later).
CREATE TABLE IF NOT EXISTS commune_livability (
  code_commune          text PRIMARY KEY,
  schools               int,
  ecoles                int,
  colleges              int,
  lycees                int,
  education_prioritaire boolean,
  crime_rate            numeric,   -- per 1000 (SSMSI)
  doctors               numeric,   -- reserved
  health_equip          int,       -- BPE health facilities (domain D)
  transport_equip       int,       -- BPE transport facilities (domain E)
  total_equip           int,       -- BPE total facilities
  fiber_pct             numeric,   -- % of premises FttH-connectable (ARCEP)
  updated_at            timestamptz DEFAULT now()
);
-- Columns added after this table first shipped (CREATE IF NOT EXISTS won't add them to existing DBs).
ALTER TABLE commune_livability ADD COLUMN IF NOT EXISTS crime_rate      numeric;
ALTER TABLE commune_livability ADD COLUMN IF NOT EXISTS doctors         numeric;
ALTER TABLE commune_livability ADD COLUMN IF NOT EXISTS health_equip    int;
ALTER TABLE commune_livability ADD COLUMN IF NOT EXISTS transport_equip int;
ALTER TABLE commune_livability ADD COLUMN IF NOT EXISTS total_equip     int;
ALTER TABLE commune_livability ADD COLUMN IF NOT EXISTS fiber_pct       numeric;

-- Environmental risks per commune (Géorisques).
CREATE TABLE IF NOT EXISTS commune_risk (
  code_commune  text PRIMARY KEY,
  seismic_zone  text,    -- zone de sismicité
  risks         text,    -- comma-joined major risk labels (inondation, mouvement de terrain, ...)
  icpe_count    int,     -- classified industrial installations
  seveso_count  int,     -- of which SEVESO (seuil bas/haut)
  updated_at    timestamptz DEFAULT now()
);

-- Local tax rates per commune (DGFiP "fiscalité locale des particuliers", REI).
CREATE TABLE IF NOT EXISTS commune_tax (
  code_commune  text PRIMARY KEY,
  exercice      text,
  taux_tfb      numeric,   -- taxe foncière bâti, total rate % (commune + EPCI + ...)
  taux_th       numeric,   -- taxe d'habitation rate % (now mainly secondary residences)
  thrs_major    text,      -- THRS majoration indicator (zones tendues / secondary residences)
  updated_at    timestamptz DEFAULT now()
);

-- Repeat sales: a transaction that is a resale of the same parcel (realized gain).
CREATE TABLE IF NOT EXISTS transaction_resale (
  transaction_id  bigint PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  prev_date       date,
  prev_prix       numeric,
  change_pct      numeric,
  years_held      numeric,
  annualized_pct  numeric
);
CREATE TABLE IF NOT EXISTS commune_resale (
  code_commune       text PRIMARY KEY,
  resales            int,
  median_gain_pct    numeric,
  median_annualized  numeric
);

-- Per-commune demographics (INSEE). population now; growth + income to follow.
CREATE TABLE IF NOT EXISTS commune_demo (
  code_commune      text PRIMARY KEY,
  code_departement  text,
  population        int,
  population_prev   int,
  pop_growth        numeric,   -- % change vs an earlier census (added later)
  median_income     numeric,   -- niveau de vie médian (added later)
  updated_at        timestamptz DEFAULT now()
);

-- Per-commune energy profile of the housing stock.
CREATE TABLE IF NOT EXISTS commune_dpe (
  code_commune  text PRIMARY KEY,
  dpe_total     int,
  pct_passoire  numeric,   -- % F or G (rental-ban risk)
  pct_abc       numeric,   -- % A/B/C (efficient)
  computed_at   timestamptz DEFAULT now()
);

-- Rent control (encadrement des loyers) reference rents, per quartier zone.
-- Zones carry a polygon for point-in-polygon address lookup; refs hold the
-- €/m² reference / majored / minored rents by rooms × epoch × furnished.
-- One row per quartier polygon (for point-in-polygon address lookup); zone_ref
-- points at the rent secteur whose reference rents apply.
CREATE TABLE IF NOT EXISTS rent_control_zone (
  id        text PRIMARY KEY,    -- "<VILLE>-q<id_quartier>"
  city      text,
  name      text,
  zone_ref  text,                -- "<VILLE>-<id_zone>" (rent secteur)
  geom      geometry(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS rent_control_zone_gix ON rent_control_zone USING GIST (geom);

-- Reference rents per secteur × rooms × epoch × furnished.
CREATE TABLE IF NOT EXISTS rent_control_ref (
  zone_ref            text,      -- "<VILLE>-<id_zone>"
  city                text,
  rooms               int,       -- 1..4 (4 = 4 rooms and more)
  epoch               text,      -- 'avant 1946' | '1946-1970' | '1971-1990' | 'apres 1990'
  furnished           boolean,
  ref_eur_m2          numeric,
  ref_majored_eur_m2  numeric,
  ref_minored_eur_m2  numeric,
  year                int
);
CREATE INDEX IF NOT EXISTS rent_control_ref_zone ON rent_control_ref (zone_ref);
