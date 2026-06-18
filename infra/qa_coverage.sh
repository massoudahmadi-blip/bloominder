#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Geocoding QA: proves that DVF transactions are fully and correctly placed.
# Prints, for the whole country:
#   - placement breakdown by geo_precision (source/parcel/address/commune)
#   - located % per year and per department (worst first), depts below threshold
#   - MISPLACED points: located rows whose coordinate falls outside the
#     department they claim to be in (needs dept_geom — run ./load_geo_ref.sh)
#   - out-of-France / null-island sanity (metropole)
#
# Usage (from infra/, db up):  ./qa_coverage.sh [min_located_pct]   (default 95)
# ---------------------------------------------------------------------------
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
TH="${1:-95}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

psql <<SQL
\echo '== National placement =='
SELECT count(*) AS transactions,
       count(geom) AS located,
       round(100.0*count(geom)/nullif(count(*),0),2) AS located_pct
FROM transactions;

\echo ''
\echo '== By precision tier =='
SELECT coalesce(geo_precision,'(unlocated)') AS precision,
       count(*) AS rows,
       round(100.0*count(*)/sum(count(*)) OVER (),2) AS pct
FROM transactions GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '== By year =='
SELECT extract(year FROM date_mutation)::int AS year,
       count(*) AS total, count(geom) AS located,
       round(100.0*count(geom)/nullif(count(*),0),2) AS pct
FROM transactions GROUP BY 1 ORDER BY 1;

\echo ''
\echo '== Departments below threshold (located %) =='
SELECT code_departement AS dept, count(*) AS total, count(geom) AS located,
       round(100.0*count(geom)/nullif(count(*),0),2) AS pct
FROM transactions GROUP BY 1
HAVING round(100.0*count(geom)/nullif(count(*),0),2) < ${TH}
ORDER BY pct ASC NULLS FIRST;

\echo ''
\echo '== MISPLACED: located >2km outside their own department polygon =='
SELECT t.code_departement AS dept, count(*) AS misplaced
FROM transactions t JOIN dept_geom d ON d.code_departement = t.code_departement
WHERE t.geom IS NOT NULL AND NOT ST_DWithin(d.geom, t.geom, 0.02)
GROUP BY 1 ORDER BY 2 DESC LIMIT 20;

\echo ''
\echo '== Departments with sales but NO validation polygon (DOM/edge) =='
SELECT DISTINCT t.code_departement
FROM transactions t LEFT JOIN dept_geom d ON d.code_departement = t.code_departement
WHERE d.code_departement IS NULL ORDER BY 1;

\echo ''
\echo '== Out-of-France / null-island (metropole only) =='
SELECT count(*) AS suspicious
FROM transactions
WHERE geom IS NOT NULL AND code_departement !~ '^9[78]'
  AND (ST_X(geom) NOT BETWEEN -6 AND 10 OR ST_Y(geom) NOT BETWEEN 41 AND 52);
SQL
echo ">> QA done (threshold ${TH}%). Investigate any non-empty MISPLACED / below-threshold / suspicious rows."
