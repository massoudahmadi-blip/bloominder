#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load one year of raw DGFiP DVF (cquest national .txt — no coordinates) into
# `transactions`. Rows keep their id_parcelle, so coordinates are filled
# afterwards by ./backfill_geom.sh (parcel centroid) — far better coverage than
# address geocoding for these files.
#
# Usage (from infra/, db up, internet):
#   ./load_dvf_hist.sh <year> <cquest_txt_url>
#   e.g. ./load_dvf_hist.sh 2019 "https://data.cquest.org/dgfip_dvf/202010/valeursfoncieres-2019.txt"
#        ./load_dvf_hist.sh 2020 "https://data.cquest.org/dgfip_dvf/202010/valeursfoncieres-2020.txt"
# Then: ./backfill_geom.sh   &&   ./compute_metrics.sh
# ---------------------------------------------------------------------------
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; DATA="$HERE/data/raw"; mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

Y="${1:?Usage: ./load_dvf_hist.sh <year> <cquest_txt_url>}"
URL="${2:?need the cquest .txt URL}"
TXT="$DATA/valeursfoncieres-$Y.txt"; SDIR="$DATA/split_$Y"

[ -f "$TXT" ] || { echo ">> Downloading $Y (~300 MB)..."; curl -fSL "$URL" -o "$TXT" || { echo "download failed"; exit 1; }; }
if [ ! -d "$SDIR" ] || [ -z "$(ls -A "$SDIR" 2>/dev/null)" ]; then
  echo ">> Splitting $Y by department..."
  python3 "$HERE/raw/dvf_raw.py" split --year "$Y" --infile "$TXT" --outdir "$SDIR"
fi

psql -c "CREATE TABLE IF NOT EXISTS stg_clean(id_synth text,date_mutation date,nature text,valeur numeric,addr_key text,adresse text,code_postal text,code_commune text,nom_commune text,code_departement text,id_parcelle text,type_local text,surface_bati numeric,nb_pieces int,surface_terrain numeric);" >/dev/null

for CLEAN in "$SDIR"/clean_*.csv; do
  [ -e "$CLEAN" ] || continue
  [ "$(wc -l < "$CLEAN")" -le 1 ] && continue
  base="$(basename "$CLEAN")"; d="${base#clean_}"; d="${d%.csv}"
  psql -c "TRUNCATE stg_clean;" >/dev/null
  psql -c "\copy stg_clean FROM '/data/raw/split_$Y/clean_$d.csv' WITH (FORMAT csv, HEADER true, NULL '')" >/dev/null
  psql >/dev/null <<SQL
DELETE FROM transactions t USING (SELECT DISTINCT code_departement FROM stg_clean) s
WHERE t.code_departement = s.code_departement AND extract(year FROM t.date_mutation) = $Y;
INSERT INTO transactions(id_mutation,date_mutation,nature_mutation,valeur_fonciere,adresse,code_postal,
  code_commune,nom_commune,code_departement,id_parcelle,type_local,surface_bati,nb_pieces,surface_terrain,prix_m2)
SELECT c.id_synth,c.date_mutation,c.nature,c.valeur,NULLIF(c.adresse,''),c.code_postal,
  c.code_commune,c.nom_commune,c.code_departement,NULLIF(c.id_parcelle,''),NULLIF(c.type_local,''),
  c.surface_bati,c.nb_pieces,c.surface_terrain,
  CASE WHEN c.surface_bati>5 AND c.valeur>0 THEN round(c.valeur/c.surface_bati) END
FROM stg_clean c WHERE c.valeur IS NOT NULL AND c.valeur>0;
SQL
  echo "   loaded dept $d $Y"
done

psql -c "ANALYZE transactions;" >/dev/null
echo ">> $Y loaded. Now: ./backfill_geom.sh (locate by parcel) then ./compute_metrics.sh"
psql -c "SELECT count(*) AS total_${Y} FROM transactions WHERE extract(year FROM date_mutation)=$Y;"
