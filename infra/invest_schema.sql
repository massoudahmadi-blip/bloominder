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
