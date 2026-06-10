#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load ALL of mainland France + DOM into `transactions`.
#   Phase 1: recent geo-DVF (2021–2025) for every department  (has coords)
#   Phase 2: split each historical year file (2014–2018) by department, ONCE
#   Phase 3: geocode (BAN) + load each department-year of historical data
#
# Long-running (several hours) — RUN INSIDE tmux:   tmux new -s france
# Resumable: re-running skips already-geocoded department-years and reloads
# idempotently (each dept+year slice is replaced, never duplicated).
#
# Usage:  ./load_all_france.sh
# ---------------------------------------------------------------------------
set -uo pipefail   # deliberately NOT -e: one department's failure must not abort the run

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data/raw"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
BASE="https://data.cquest.org/dgfip_dvf/201904"
BAN="https://api-adresse.data.gouv.fr/search/csv/"

RECENT_FROM=2021; RECENT_TO=2025
HIST_FROM=2014;   HIST_TO=2018

# Department list: 01–95 (skip 20), Corsica 2A/2B, DOM. Non-existent ones just skip.
DEPTS="$(seq -w 1 95 | grep -vx 20) 2A 2B 971 972 973 974"

psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

psql -c "CREATE TABLE IF NOT EXISTS stg_clean(id_synth text,date_mutation date,nature text,valeur numeric,addr_key text,adresse text,code_postal text,code_commune text,nom_commune text,code_departement text,id_parcelle text,type_local text,surface_bati numeric,nb_pieces int,surface_terrain numeric);
CREATE TABLE IF NOT EXISTS stg_geo(addr_key text,lat double precision,lon double precision,score double precision);"

# ---------------------------------------------------------------------------
echo "############ PHASE 1: recent geo-DVF ${RECENT_FROM}-${RECENT_TO} (all departments) ############"
for d in $DEPTS; do
  echo "--- dept $d (recent) ---"
  "$HERE/load_dvf.sh" "$d" "$RECENT_FROM" "$RECENT_TO" || echo "   dept $d recent FAILED, continuing"
done

# ---------------------------------------------------------------------------
echo "############ PHASE 2: split historical ${HIST_FROM}-${HIST_TO} by department ############"
for Y in $(seq "$HIST_FROM" "$HIST_TO"); do
  TXT="$DATA/valeursfoncieres-$Y.txt"
  if [ ! -f "$TXT" ]; then
    echo ">> Downloading national $Y (~300 MB)..."
    curl -fSL "$BASE/valeursfoncieres-$Y.txt" -o "$TXT" || { echo "   no file for $Y"; rm -f "$TXT"; continue; }
  fi
  if [ ! -d "$DATA/split_$Y" ] || [ -z "$(ls -A "$DATA/split_$Y" 2>/dev/null)" ]; then
    echo ">> Splitting $Y by department..."
    python3 "$HERE/raw/dvf_raw.py" split --year "$Y" --infile "$TXT" --outdir "$DATA/split_$Y"
  fi
done

# ---------------------------------------------------------------------------
echo "############ PHASE 3: geocode + load historical ${HIST_FROM}-${HIST_TO} ############"
for Y in $(seq "$HIST_FROM" "$HIST_TO"); do
  SDIR="$DATA/split_$Y"
  [ -d "$SDIR" ] || continue
  for CLEAN in "$SDIR"/clean_*.csv; do
    [ -e "$CLEAN" ] || continue
    [ "$(wc -l < "$CLEAN")" -le 1 ] && continue       # header only → no data
    base="$(basename "$CLEAN")"; d="${base#clean_}"; d="${d%.csv}"
    ADDR="$SDIR/addr_$d.csv"
    GEOSLIM="$SDIR/geoslim_$d.csv"

    if [ ! -s "$GEOSLIM" ]; then
      echo "   geocoding dept $d $Y ..."
      curl -sS -X POST -F data=@"$ADDR" \
        -F columns=numero -F columns=voie -F citycode=citycode -F postcode=code_postal \
        -F result_columns=latitude -F result_columns=longitude -F result_columns=result_score \
        "$BAN" -o "$SDIR/geo_$d.csv"
      if head -1 "$SDIR/geo_$d.csv" 2>/dev/null | grep -q latitude; then
        python3 "$HERE/raw/dvf_raw.py" slim --geocoded "$SDIR/geo_$d.csv" --out "$GEOSLIM"
      else
        echo "     BAN geocoding failed for dept $d $Y — will retry on next run"; continue
      fi
    fi

    psql -c "TRUNCATE stg_clean; TRUNCATE stg_geo;" >/dev/null
    psql -c "\copy stg_clean FROM '/data/raw/split_$Y/clean_$d.csv' WITH (FORMAT csv, HEADER true, NULL '')" >/dev/null
    psql -c "\copy stg_geo   FROM '/data/raw/split_$Y/geoslim_$d.csv' WITH (FORMAT csv, HEADER true, NULL '')" >/dev/null
    psql >/dev/null <<SQL
DELETE FROM transactions t USING (SELECT DISTINCT code_departement FROM stg_clean) s
WHERE t.code_departement = s.code_departement AND extract(year FROM t.date_mutation) = $Y;
INSERT INTO transactions(id_mutation,date_mutation,nature_mutation,valeur_fonciere,adresse,code_postal,code_commune,nom_commune,code_departement,id_parcelle,type_local,surface_bati,nb_pieces,surface_terrain,prix_m2,longitude,latitude,geom)
SELECT c.id_synth,c.date_mutation,c.nature,c.valeur,NULLIF(c.adresse,''),c.code_postal,c.code_commune,c.nom_commune,c.code_departement,NULLIF(c.id_parcelle,''),NULLIF(c.type_local,''),c.surface_bati,c.nb_pieces,c.surface_terrain,
 CASE WHEN c.surface_bati>5 AND c.valeur>0 THEN round(c.valeur/c.surface_bati) END,
 g.lon,g.lat,
 CASE WHEN g.lon IS NOT NULL AND g.lat IS NOT NULL THEN ST_SetSRID(ST_MakePoint(g.lon,g.lat),4326) END
FROM stg_clean c LEFT JOIN stg_geo g USING(addr_key) WHERE c.valeur IS NOT NULL AND c.valeur>0;
SQL
    echo "   loaded dept $d $Y"
  done
done

echo "############ DONE ############"
psql -c "ANALYZE transactions; SELECT count(*) AS total, count(geom) AS with_coords, count(DISTINCT code_departement) AS departments, min(date_mutation), max(date_mutation) FROM transactions;"
