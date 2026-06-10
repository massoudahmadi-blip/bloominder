#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Cross-check DVF sales against DPE energy diagnostics: match each transaction
# to its nearest DPE within ~50 m (vendrebien-style), then summarise each
# commune's energy profile. Run AFTER load_dvf/all_france AND load_dpe.
#
#   ./match_dpe.sh            -> all departments
#   ./match_dpe.sh 13 06      -> specific departments
#
# Per-department so the GiST index is used efficiently. Idempotent.
# ---------------------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

if [ "$#" -gt 0 ]; then DEPTS="$*"; else DEPTS="$(seq -w 1 95 | grep -vx 20) 2A 2B 971 972 973 974"; fi

psql < "$HERE/invest_schema.sql" >/dev/null

for d in $DEPTS; do
  echo ">> Matching dept $d ..."
  psql >/dev/null <<SQL
DELETE FROM transaction_dpe td USING transactions t
  WHERE td.transaction_id = t.id AND t.code_departement = '$d';
INSERT INTO transaction_dpe(transaction_id,numero_dpe,etiquette_dpe,etiquette_ges,distance_m)
SELECT t.id, n.numero_dpe, n.etiquette_dpe, n.etiquette_ges, round(n.dist)
FROM transactions t
CROSS JOIN LATERAL (
  SELECT d.numero_dpe, d.etiquette_dpe, d.etiquette_ges,
         ST_Distance(t.geom::geography, d.geom::geography) AS dist
  FROM dpe d
  WHERE ST_DWithin(t.geom, d.geom, 0.0006)        -- ~50 m, uses the geom GiST index
  ORDER BY t.geom <-> d.geom
  LIMIT 1
) n
WHERE t.geom IS NOT NULL AND t.code_departement = '$d' AND n.dist <= 50
ON CONFLICT (transaction_id) DO UPDATE
  SET numero_dpe=EXCLUDED.numero_dpe, etiquette_dpe=EXCLUDED.etiquette_dpe,
      etiquette_ges=EXCLUDED.etiquette_ges, distance_m=EXCLUDED.distance_m;
SQL
done

echo ">> Computing commune energy profiles..."
psql >/dev/null <<'SQL'
TRUNCATE commune_dpe;
INSERT INTO commune_dpe(code_commune,dpe_total,pct_passoire,pct_abc)
SELECT code_commune, count(*),
  round(100.0 * count(*) FILTER (WHERE etiquette_dpe IN ('F','G')) / count(*), 1),
  round(100.0 * count(*) FILTER (WHERE etiquette_dpe IN ('A','B','C')) / count(*), 1)
FROM dpe
WHERE code_commune IS NOT NULL AND code_commune <> ''
GROUP BY code_commune;
SQL

echo ">> Done. Matched sales + 'valeur verte' (median €/m² by energy class):"
psql -c "SELECT count(*) AS sales_with_dpe FROM transaction_dpe;"
psql -c "SELECT td.etiquette_dpe AS classe, count(*) AS ventes,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t.prix_m2)) AS median_eur_m2
FROM transaction_dpe td JOIN transactions t ON t.id = td.transaction_id
WHERE t.prix_m2 IS NOT NULL
GROUP BY td.etiquette_dpe ORDER BY classe;"
