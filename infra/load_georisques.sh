#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fetch environmental risks per commune from the Géorisques API into commune_risk.
#   ./load_georisques.sh            # all communes in commune_metrics
#   ./load_georisques.sh 13 06 75   # only these departments
#
# Per-commune API calls (rate-limited) — long for all France, RUN IN TMUX.
# Idempotent (upsert by code_commune). Run compute_metrics first so the
# commune list exists.
# ---------------------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data/georisques"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

# Build the list of commune codes to fetch.
if [ "$#" -gt 0 ]; then
  IN="'$(echo "$@" | sed "s/ /','/g")'"
  WHERE="WHERE code_departement IN ($IN)"
else
  WHERE=""
fi
psql -t -A -c "SELECT code_commune FROM commune_metrics $WHERE ORDER BY code_commune;" > "$DATA/codes.txt"
echo ">> $(wc -l < "$DATA/codes.txt") communes to query (Géorisques)..."

python3 "$HERE/raw/fetch_georisques.py" --codes "$DATA/codes.txt" --out "$DATA/risk.csv"

echo ">> Loading into commune_risk..."
psql -c "DROP TABLE IF EXISTS stg_risk;
CREATE TABLE stg_risk(code_commune text, seismic_zone text, risks text, icpe_count text, seveso_count text);" >/dev/null
psql -c "\copy stg_risk FROM '/data/georisques/risk.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
psql -c "INSERT INTO commune_risk(code_commune,seismic_zone,risks,icpe_count,seveso_count)
  SELECT code_commune, NULLIF(seismic_zone,''), NULLIF(risks,''),
         NULLIF(icpe_count,'')::int, NULLIF(seveso_count,'')::int
  FROM stg_risk WHERE code_commune <> ''
  ON CONFLICT (code_commune) DO UPDATE
    SET seismic_zone=EXCLUDED.seismic_zone, risks=EXCLUDED.risks,
        icpe_count=EXCLUDED.icpe_count, seveso_count=EXCLUDED.seveso_count, updated_at=now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_risk;" >/dev/null

echo ">> Done. Communes with risk data + SEVESO totals:"
psql -c "SELECT count(*) AS communes, sum(icpe_count) AS icpe_total, sum(seveso_count) AS seveso_total FROM commune_risk;"
