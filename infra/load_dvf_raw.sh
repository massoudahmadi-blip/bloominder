#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load RAW historical DGFiP DVF (2014–2018) for a department, with geocoding.
#
# Source: https://data.cquest.org/dgfip_dvf/201904/valeursfoncieres-YYYY.txt
# These national files have NO coordinates, so each unique address is geocoded
# via the French BAN bulk service, then joined back and loaded into `transactions`.
#
# Usage:  ./load_dvf_raw.sh <DEPT> <YEAR_FROM> <YEAR_TO>
# Example (validate the pipeline on Bouches-du-Rhône):
#   ./load_dvf_raw.sh 13 2014 2018
#
# Re-running a (dept, year) is safe: it replaces that slice (idempotent).
# ---------------------------------------------------------------------------
set -euo pipefail

DEPT="${1:?Usage: ./load_dvf_raw.sh <DEPT> <YEAR_FROM> <YEAR_TO>}"
Y1="${2:?need YEAR_FROM}"
Y2="${3:?need YEAR_TO}"

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data/raw"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
BASE="https://data.cquest.org/dgfip_dvf/201904"
BAN="https://api-adresse.data.gouv.fr/search/csv/"

psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Preparing staging tables..."
psql -c "DROP TABLE IF EXISTS stg_clean; CREATE TABLE stg_clean(id_synth text,date_mutation date,nature text,valeur numeric,addr_key text,adresse text,code_postal text,code_commune text,nom_commune text,code_departement text,id_parcelle text,type_local text,surface_bati numeric,nb_pieces int,surface_terrain numeric,prefixe_section text,section text,no_plan text,no_volume text,nombre_lots int,surface_carrez numeric);
CREATE TABLE IF NOT EXISTS stg_geo(addr_key text,lat double precision,lon double precision,score double precision);"

for Y in $(seq "$Y1" "$Y2"); do
  TXT="$DATA/valeursfoncieres-$Y.txt"
  if [ ! -f "$TXT" ]; then
    echo ">> Downloading national $Y (large, ~300 MB)..."
    if ! curl -fSL "$BASE/valeursfoncieres-$Y.txt" -o "$TXT"; then
      echo "   no file for $Y — skipping"; rm -f "$TXT"; continue
    fi
  fi

  echo ">> Parsing $Y (dept $DEPT)..."
  python3 "$HERE/raw/dvf_raw.py" parse --dept "$DEPT" --year "$Y" \
    --infile "$TXT" --clean "$DATA/clean_${DEPT}_$Y.csv" --addr "$DATA/addr_${DEPT}_$Y.csv"

  echo ">> Geocoding $Y via BAN..."
  curl -sS -X POST \
    -F data=@"$DATA/addr_${DEPT}_$Y.csv" \
    -F columns=numero -F columns=voie \
    -F citycode=citycode \
    -F postcode=code_postal \
    -F result_columns=latitude -F result_columns=longitude -F result_columns=result_score \
    "$BAN" -o "$DATA/geo_${DEPT}_$Y.csv"
  python3 "$HERE/raw/dvf_raw.py" slim --geocoded "$DATA/geo_${DEPT}_$Y.csv" --out "$DATA/geoslim_${DEPT}_$Y.csv"

  echo ">> Loading $Y into transactions..."
  psql -c "TRUNCATE stg_clean; TRUNCATE stg_geo;"
  psql -c "\copy stg_clean FROM '/data/raw/clean_${DEPT}_$Y.csv' WITH (FORMAT csv, HEADER true, NULL '')"
  psql -c "\copy stg_geo   FROM '/data/raw/geoslim_${DEPT}_$Y.csv' WITH (FORMAT csv, HEADER true, NULL '')"
  if [ "$DEPT" != "all" ]; then
    psql -c "DELETE FROM transactions WHERE code_departement='$DEPT' AND extract(year FROM date_mutation)=$Y;"
  fi
  psql <<'SQL'
INSERT INTO transactions(id_mutation,date_mutation,nature_mutation,valeur_fonciere,adresse,code_postal,
  code_commune,nom_commune,code_departement,id_parcelle,type_local,surface_bati,nb_pieces,surface_terrain,
  prefixe_section,section,no_plan,no_volume,nombre_lots,surface_carrez,
  prix_m2,longitude,latitude,geom,geo_precision)
SELECT c.id_synth,c.date_mutation,c.nature,c.valeur,NULLIF(c.adresse,''),c.code_postal,
  c.code_commune,c.nom_commune,c.code_departement,NULLIF(c.id_parcelle,''),NULLIF(c.type_local,''),
  c.surface_bati,c.nb_pieces,c.surface_terrain,
  NULLIF(c.prefixe_section,''),NULLIF(c.section,''),NULLIF(c.no_plan,''),NULLIF(c.no_volume,''),
  c.nombre_lots,c.surface_carrez,
  CASE WHEN c.valeur > 0 AND coalesce(NULLIF(c.surface_carrez,0),c.surface_bati) > 5
       THEN round(c.valeur / coalesce(NULLIF(c.surface_carrez,0),c.surface_bati)) END,
  g.lon, g.lat,
  CASE WHEN g.lon IS NOT NULL AND g.lat IS NOT NULL
       THEN ST_SetSRID(ST_MakePoint(g.lon, g.lat), 4326) END,
  CASE WHEN g.lon IS NOT NULL AND g.lat IS NOT NULL THEN 'address' END
FROM stg_clean c
LEFT JOIN stg_geo g USING (addr_key)
WHERE c.valeur IS NOT NULL AND c.valeur > 0;
SQL
done

echo ">> Done. Totals:"
psql -c "ANALYZE transactions; SELECT count(*) AS total, count(geom) AS with_coords, min(date_mutation), max(date_mutation) FROM transactions;"
