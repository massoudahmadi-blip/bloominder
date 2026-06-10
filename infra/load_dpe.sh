#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fetch + load ADEME DPE energy diagnostics into the `dpe` table.
#   ./load_dpe.sh            -> all departments
#   ./load_dpe.sh 13 06 75   -> specific departments
#
# Long-running for all-France (millions of records) — run in tmux. Idempotent:
# rows upsert by numero_dpe. Coordinates (Lambert-93) are projected to WGS84.
# ---------------------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data/dpe"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

if [ "$#" -gt 0 ]; then DEPTS="$*"; else DEPTS="$(seq -w 1 95 | grep -vx 20) 2A 2B 971 972 973 974"; fi

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_dpe;
CREATE TABLE stg_dpe(numero_dpe text,date_dpe text,type_batiment text,etiquette_dpe text,
  etiquette_ges text,surface text,code_commune text,code_postal text,x text,y text);" >/dev/null

for d in $DEPTS; do
  echo ">> Department $d ..."
  if ! python3 "$HERE/raw/fetch_dpe.py" --dept "$d" --out "$DATA/dpe_$d.csv"; then
    echo "   fetch failed for $d, continuing"; continue
  fi
  [ -s "$DATA/dpe_$d.csv" ] || { echo "   no data for $d"; continue; }
  psql -c "TRUNCATE stg_dpe;" >/dev/null
  psql -c "\copy stg_dpe FROM '/data/dpe/dpe_$d.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
  psql >/dev/null <<'SQL'
INSERT INTO dpe(numero_dpe,date_dpe,type_batiment,etiquette_dpe,etiquette_ges,surface,code_commune,code_postal,geom)
SELECT numero_dpe,
       NULLIF(date_dpe,'')::date,
       NULLIF(type_batiment,''),
       etiquette_dpe,
       NULLIF(etiquette_ges,''),
       NULLIF(surface,'')::numeric,
       NULLIF(code_commune,''),
       NULLIF(code_postal,''),
       CASE WHEN x <> '' AND y <> ''
            THEN ST_Transform(ST_SetSRID(ST_MakePoint(x::double precision, y::double precision), 2154), 4326)
       END
FROM stg_dpe
WHERE numero_dpe IS NOT NULL AND numero_dpe <> ''
ON CONFLICT (numero_dpe) DO NOTHING;
SQL
done

psql -c "DROP TABLE IF EXISTS stg_dpe;" >/dev/null
echo ">> Done. DPE rows:"
psql -c "ANALYZE dpe; SELECT count(*) AS total, count(geom) AS with_coords, count(*) FILTER (WHERE etiquette_dpe IN ('F','G')) AS passoires FROM dpe;"
