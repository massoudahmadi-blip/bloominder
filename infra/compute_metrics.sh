#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Compute per-commune market metrics + investment scores from transactions
# (DVF) and rents_commune (Carte des loyers). Run AFTER the DVF load and
# load_rents.sh. Re-run any time data refreshes — fully idempotent.
#
# Usage:  ./compute_metrics.sh
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Ensuring investor schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Computing commune_metrics (median €/m², 3y growth, gross yield)..."
psql >/dev/null <<'SQL'
SET work_mem = '256MB';                 -- keep the median sorts in RAM, not on disk
SET max_parallel_workers_per_gather = 4;
TRUNCATE commune_metrics;
WITH b AS (SELECT max(date_mutation) AS maxd FROM transactions),
agg AS (
  SELECT code_commune,
    max(nom_commune)      AS nom_commune,
    max(code_departement) AS code_departement,
    count(*)              AS ventes_total,
    count(*) FILTER (WHERE date_mutation >= (SELECT maxd FROM b) - INTERVAL '12 months') AS ventes_12m,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 IS NOT NULL) AS med_all,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 IS NOT NULL AND type_local='Appartement') AS med_app,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 IS NOT NULL AND type_local='Maison') AS med_mai,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2) FILTER (
      WHERE prix_m2 IS NOT NULL AND date_mutation >= (SELECT maxd FROM b) - INTERVAL '12 months') AS med_now,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2) FILTER (
      WHERE prix_m2 IS NOT NULL
        AND date_mutation <  (SELECT maxd FROM b) - INTERVAL '36 months'
        AND date_mutation >= (SELECT maxd FROM b) - INTERVAL '48 months') AS med_3y
  FROM transactions
  GROUP BY code_commune
)
INSERT INTO commune_metrics(code_commune,nom_commune,code_departement,ventes_total,ventes_12m,
  median_prix_m2,median_prix_m2_appartement,median_prix_m2_maison,prix_m2_growth_3y,
  loyer_m2_appartement,loyer_m2_maison,rendement_brut_appartement,rendement_brut_maison)
SELECT a.code_commune, a.nom_commune, a.code_departement, a.ventes_total, a.ventes_12m,
  round(a.med_all), round(a.med_app), round(a.med_mai),
  CASE WHEN a.med_3y > 0 THEN round(((a.med_now - a.med_3y) / a.med_3y * 100)::numeric, 1) END,
  rc.loyer_m2_appartement, rc.loyer_m2_maison,
  CASE WHEN a.med_app > 0 AND rc.loyer_m2_appartement IS NOT NULL
       THEN round((rc.loyer_m2_appartement * 12 / a.med_app * 100)::numeric, 2) END,
  CASE WHEN a.med_mai > 0 AND rc.loyer_m2_maison IS NOT NULL
       THEN round((rc.loyer_m2_maison * 12 / a.med_mai * 100)::numeric, 2) END
FROM agg a
LEFT JOIN rents_commune rc ON rc.code_commune = a.code_commune
WHERE a.ventes_total >= 5;
SQL

echo ">> Computing commune_scores (default weights: yield .45 / growth .35 / demand .20)..."
psql >/dev/null <<'SQL'
TRUNCATE commune_scores;
WITH base AS (
  SELECT code_commune,
         COALESCE(rendement_brut_appartement, rendement_brut_maison) AS yield,
         prix_m2_growth_3y AS growth,
         ventes_12m        AS demand
  FROM commune_metrics
  WHERE ventes_total >= 20
),
ranked AS (
  SELECT code_commune,
    CASE WHEN yield  IS NOT NULL THEN round((percent_rank() OVER (ORDER BY yield)  * 100)::numeric,1) END AS score_yield,
    CASE WHEN growth IS NOT NULL THEN round((percent_rank() OVER (ORDER BY growth) * 100)::numeric,1) END AS score_growth,
    round((percent_rank() OVER (ORDER BY demand) * 100)::numeric,1) AS score_demand
  FROM base
)
INSERT INTO commune_scores(code_commune,score_yield,score_growth,score_demand,score_global)
SELECT code_commune, score_yield, score_growth, score_demand,
  round(( 0.45*COALESCE(score_yield,0)
        + 0.35*COALESCE(score_growth,0)
        + 0.20*COALESCE(score_demand,0))::numeric, 1)
FROM ranked;
SQL

echo ">> Done. Top 15 communes by global score:"
psql -c "SELECT m.code_commune, m.nom_commune, m.median_prix_m2, m.rendement_brut_appartement AS yield_appt,
  m.prix_m2_growth_3y AS growth_3y, s.score_global
FROM commune_scores s JOIN commune_metrics m USING(code_commune)
WHERE m.ventes_total >= 50
ORDER BY s.score_global DESC LIMIT 15;"
