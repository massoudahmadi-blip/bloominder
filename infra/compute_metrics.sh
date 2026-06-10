#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Compute per-commune market metrics + investment scores from transactions
# (DVF) and rents_commune (Carte des loyers). Run AFTER the DVF load and
# load_rents.sh. Re-run any time data refreshes — fully idempotent.
#
# Multi-lot dedup: a DVF "mutation" (one sale) can span several rows/lots that
# repeat the full price. We group on the natural key (commune, date, valeur)
# to (a) correct each row's €/m² to the mutation's total built surface and
# (b) compute commune medians/counts per MUTATION, not per row.
#
# Robustness: €/m² clamped to 400–25000 (drops garages/junk); yields/growth
# capped; only active markets scored.
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

echo ">> Correcting €/m² to mutation level (multi-lot dedup)..."
psql >/dev/null <<'SQL'
SET work_mem = '256MB';
UPDATE transactions t SET prix_m2 = q.pm2
FROM (
  SELECT code_commune, date_mutation, valeur_fonciere,
         round(valeur_fonciere / sum(surface_bati)) AS pm2
  FROM transactions
  WHERE valeur_fonciere > 0 AND surface_bati IS NOT NULL
  GROUP BY code_commune, date_mutation, valeur_fonciere
  HAVING sum(surface_bati) > 5
) q
WHERE t.code_commune = q.code_commune AND t.date_mutation = q.date_mutation
  AND t.valeur_fonciere = q.valeur_fonciere AND t.surface_bati IS NOT NULL
  AND t.prix_m2 IS DISTINCT FROM q.pm2;
SQL

echo ">> Computing commune_metrics (mutation-level median €/m², 3y growth, gross yield)..."
psql >/dev/null <<'SQL'
SET work_mem = '256MB';
SET max_parallel_workers_per_gather = 4;
TRUNCATE commune_metrics;
WITH b AS (SELECT max(date_mutation) AS maxd FROM transactions),
mut AS (
  SELECT code_commune, date_mutation, valeur_fonciere,
    max(nom_commune)      AS nom_commune,
    max(code_departement) AS code_departement,
    max(code_postal)      AS code_postal,
    (array_agg(type_local ORDER BY surface_bati DESC NULLS LAST))[1] AS type_local,
    CASE WHEN sum(surface_bati) > 5 THEN valeur_fonciere / sum(surface_bati) END AS prix_m2
  FROM transactions
  WHERE nature_mutation = 'Vente' AND valeur_fonciere > 0
  GROUP BY code_commune, date_mutation, valeur_fonciere
),
agg AS (
  SELECT code_commune,
    max(nom_commune)      AS nom_commune,
    max(code_departement) AS code_departement,
    max(code_postal)      AS code_postal,
    count(*)              AS ventes_total,
    count(*) FILTER (WHERE date_mutation >= (SELECT maxd FROM b) - INTERVAL '12 months') AS ventes_12m,
    count(*) FILTER (WHERE type_local='Appartement' AND prix_m2 BETWEEN 400 AND 25000)   AS n_app,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 BETWEEN 400 AND 25000) AS med_all,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 BETWEEN 400 AND 25000 AND type_local='Appartement') AS med_app,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 BETWEEN 400 AND 25000 AND type_local='Maison') AS med_mai,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY prix_m2) FILTER (
      WHERE prix_m2 BETWEEN 400 AND 25000 AND date_mutation >= (SELECT maxd FROM b) - INTERVAL '12 months') AS med_now,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY prix_m2) FILTER (
      WHERE prix_m2 BETWEEN 400 AND 25000
        AND date_mutation <  (SELECT maxd FROM b) - INTERVAL '36 months'
        AND date_mutation >= (SELECT maxd FROM b) - INTERVAL '48 months') AS med_3y,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 BETWEEN 400 AND 25000) AS p25,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY prix_m2) FILTER (WHERE prix_m2 BETWEEN 400 AND 25000) AS p75
  FROM mut
  GROUP BY code_commune
)
INSERT INTO commune_metrics(code_commune,nom_commune,code_departement,ventes_total,ventes_12m,
  median_prix_m2,median_prix_m2_appartement,median_prix_m2_maison,prix_m2_growth_3y,
  loyer_m2_appartement,loyer_m2_maison,rendement_brut_appartement,rendement_brut_maison,
  p25_prix_m2,p75_prix_m2,code_postal)
SELECT a.code_commune, a.nom_commune, a.code_departement, a.ventes_total, a.ventes_12m,
  round(a.med_all), round(a.med_app), round(a.med_mai),
  CASE WHEN a.med_3y > 0 AND ((a.med_now - a.med_3y) / a.med_3y * 100) BETWEEN -50 AND 200
       THEN round(((a.med_now - a.med_3y) / a.med_3y * 100)::numeric, 1) END,
  rc.loyer_m2_appartement, rc.loyer_m2_maison,
  CASE WHEN a.med_app > 0 AND a.n_app >= 10 AND rc.loyer_m2_appartement IS NOT NULL
        AND (rc.loyer_m2_appartement * 12 / a.med_app * 100) <= 25
       THEN round((rc.loyer_m2_appartement * 12 / a.med_app * 100)::numeric, 2) END,
  CASE WHEN a.med_mai > 0 AND rc.loyer_m2_maison IS NOT NULL
        AND (rc.loyer_m2_maison * 12 / a.med_mai * 100) <= 25
       THEN round((rc.loyer_m2_maison * 12 / a.med_mai * 100)::numeric, 2) END,
  round(a.p25), round(a.p75), a.code_postal
FROM agg a
LEFT JOIN rents_commune rc ON rc.code_commune = a.code_commune
WHERE a.ventes_total >= 5;

-- Liquidity: median days from DPE establishment to sale (DPE→deed).
UPDATE commune_metrics m SET median_days_to_sell = q.d
FROM (
  SELECT t.code_commune,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (t.date_mutation - d.date_dpe)))::int AS d
  FROM transaction_dpe td
  JOIN transactions t ON t.id = td.transaction_id
  JOIN dpe d ON d.numero_dpe = td.numero_dpe
  WHERE d.date_dpe IS NOT NULL AND t.date_mutation > d.date_dpe
    AND (t.date_mutation - d.date_dpe) BETWEEN 1 AND 730
  GROUP BY t.code_commune
) q WHERE q.code_commune = m.code_commune;

-- Peer benchmarks: national + per-department median €/m².
TRUNCATE benchmark;
INSERT INTO benchmark(scope,code,median_prix_m2)
SELECT 'FR','FR', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2))
FROM transactions WHERE prix_m2 BETWEEN 400 AND 25000;
INSERT INTO benchmark(scope,code,median_prix_m2)
SELECT 'DEP', code_departement, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2))
FROM transactions WHERE prix_m2 BETWEEN 400 AND 25000 AND code_departement IS NOT NULL
GROUP BY code_departement;
SQL

echo ">> Computing commune_scores (default weights: yield .45 / growth .35 / demand .20)..."
psql >/dev/null <<'SQL'
TRUNCATE commune_scores;
WITH base AS (
  SELECT m.code_commune,
         CASE WHEN m.rendement_brut_appartement BETWEEN 1 AND 15 THEN m.rendement_brut_appartement END AS yield,
         CASE WHEN m.prix_m2_growth_3y BETWEEN -40 AND 80 THEN m.prix_m2_growth_3y END AS growth,
         m.ventes_12m AS activity,
         COALESCE(d.population, 0) AS population
  FROM commune_metrics m
  LEFT JOIN commune_demo d USING (code_commune)
  WHERE m.ventes_total >= 50 AND m.ventes_12m >= 10
),
ranked AS (
  SELECT code_commune,
    CASE WHEN yield  IS NOT NULL THEN round((percent_rank() OVER (ORDER BY yield)  * 100)::numeric,1) END AS score_yield,
    CASE WHEN growth IS NOT NULL THEN round((percent_rank() OVER (ORDER BY growth) * 100)::numeric,1) END AS score_growth,
    round(((0.5 * percent_rank() OVER (ORDER BY activity)
          + 0.5 * percent_rank() OVER (ORDER BY population)) * 100)::numeric,1) AS score_demand
  FROM base
)
INSERT INTO commune_scores(code_commune,score_yield,score_growth,score_demand,score_global)
SELECT code_commune, score_yield, score_growth, score_demand,
  round(( 0.45*COALESCE(score_yield,0)
        + 0.35*COALESCE(score_growth,0)
        + 0.20*COALESCE(score_demand,0))::numeric, 1)
FROM ranked;
SQL

echo ">> Done. Top 15 markets by global score (active markets only):"
psql -c "SELECT m.code_commune, m.nom_commune, m.ventes_total AS ventes, m.median_prix_m2 AS prix_m2,
  m.rendement_brut_appartement AS yield_appt, m.prix_m2_growth_3y AS growth_3y, s.score_global
FROM commune_scores s JOIN commune_metrics m USING(code_commune)
WHERE m.ventes_total >= 200
ORDER BY s.score_global DESC LIMIT 15;"
