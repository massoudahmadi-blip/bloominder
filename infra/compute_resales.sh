#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Detect repeat sales (same cadastral parcel sold more than once) and compute
# the realized gain between consecutive sales. Run AFTER the DVF load.
# Re-run any time — idempotent. Uses existing data; no new source.
#
# Usage:  ./compute_resales.sh
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Detecting repeat sales (same parcel, like-for-like type)..."
psql >/dev/null <<'SQL'
SET work_mem = '256MB';
TRUNCATE transaction_resale;
INSERT INTO transaction_resale(transaction_id,prev_date,prev_prix,change_pct,years_held,annualized_pct)
SELECT id, prev_date, prev_prix,
  round(((valeur_fonciere - prev_prix) / prev_prix * 100)::numeric, 1) AS change_pct,
  round(years::numeric, 1) AS years_held,
  CASE WHEN years >= 0.5
       THEN round(((power((valeur_fonciere / prev_prix)::double precision, 1.0 / years) - 1) * 100)::numeric, 1)
  END AS annualized_pct
FROM (
  SELECT id, valeur_fonciere, date_mutation, type_local,
    LAG(valeur_fonciere) OVER w AS prev_prix,
    LAG(date_mutation)   OVER w AS prev_date,
    LAG(type_local)      OVER w AS prev_type,
    EXTRACT(EPOCH FROM (date_mutation - LAG(date_mutation) OVER w)) / 31557600.0 AS years
  FROM transactions
  WHERE id_parcelle IS NOT NULL AND valeur_fonciere > 0
  WINDOW w AS (PARTITION BY id_parcelle ORDER BY date_mutation, id)
) s
WHERE prev_prix IS NOT NULL AND prev_prix > 0
  AND type_local IS NOT NULL AND type_local = prev_type   -- like-for-like (avoid land→built)
  AND (valeur_fonciere / prev_prix) BETWEEN 0.2 AND 5     -- drop implausible ratios
  AND years > 0;
SQL

echo ">> Aggregating commune resale gains..."
psql >/dev/null <<'SQL'
TRUNCATE commune_resale;
INSERT INTO commune_resale(code_commune,resales,median_gain_pct,median_annualized)
SELECT t.code_commune, count(*),
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.change_pct)::numeric, 1),
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.annualized_pct)::numeric, 1)
FROM transaction_resale r JOIN transactions t ON t.id = r.transaction_id
WHERE r.change_pct BETWEEN -50 AND 300
GROUP BY t.code_commune;
SQL

echo ">> Done. Repeat-sales summary + top communes by median realized gain:"
psql -c "SELECT count(*) AS repeat_sales FROM transaction_resale;"
psql -c "SELECT cr.code_commune, m.nom_commune, cr.resales, cr.median_gain_pct, cr.median_annualized
FROM commune_resale cr JOIN commune_metrics m USING(code_commune)
WHERE cr.resales >= 30 ORDER BY cr.median_gain_pct DESC LIMIT 12;"
