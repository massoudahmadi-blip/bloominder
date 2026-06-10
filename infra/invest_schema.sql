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
