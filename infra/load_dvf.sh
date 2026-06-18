#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Bloominder — load DVF (geolocated) data for one or more departments/years.
#
# Usage:
#   ./load_dvf.sh <DEPT> <YEAR_FROM> <YEAR_TO>
# Example (Bouches-du-Rhône, 2019..2024 — a good PACA pilot near Mas des Figues):
#   ./load_dvf.sh 13 2019 2024
#
# Source: Etalab "DVF géolocalisé" — already includes longitude/latitude.
#   https://files.data.gouv.fr/geo-dvf/latest/csv/<YEAR>/departements/<DEPT>.csv.gz
#
# Run this from the infra/ folder on the VPS, with the db container already up.
# ---------------------------------------------------------------------------
set -euo pipefail

DEPT="${1:?Usage: ./load_dvf.sh <DEPT> <YEAR_FROM> <YEAR_TO>}"
YEAR_FROM="${2:?need YEAR_FROM}"
YEAR_TO="${3:?need YEAR_TO}"

DATA_DIR="./data"
mkdir -p "$DATA_DIR"

# Use the same env the compose file uses.
[ -f .env ] && set -a && . ./.env && set +a
DB="${POSTGRES_DB:-bloominder}"
USER="${POSTGRES_USER:-bloominder}"

psql() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" "$@"; }

echo ">> Truncating staging table..."
psql -c "TRUNCATE dvf_raw;"

for YEAR in $(seq "$YEAR_FROM" "$YEAR_TO"); do
  URL="https://files.data.gouv.fr/geo-dvf/latest/csv/${YEAR}/departements/${DEPT}.csv.gz"
  GZ="${DATA_DIR}/dvf_${DEPT}_${YEAR}.csv.gz"
  CSV="${DATA_DIR}/dvf_${DEPT}_${YEAR}.csv"

  echo ">> Downloading ${YEAR} dept ${DEPT} ..."
  if ! curl -fSL "$URL" -o "$GZ"; then
    echo "   (no file for ${YEAR}/${DEPT} — skipping)"; continue
  fi
  gunzip -f "$GZ"

  echo ">> Loading ${CSV} into dvf_raw ..."
  # \copy reads the file from inside the container (./data is mounted at /data).
  psql -c "\copy dvf_raw FROM '/data/$(basename "$CSV")' WITH (FORMAT csv, HEADER true)"
  rm -f "$CSV"
done

echo ">> Transforming raw -> transactions (clean, typed, geolocated)..."
psql <<SQL
-- Idempotent: drop any existing rows for these departments+years before reinserting.
DELETE FROM transactions t
USING (SELECT DISTINCT code_departement FROM dvf_raw) d
WHERE t.code_departement = d.code_departement
  AND t.date_mutation BETWEEN '${YEAR_FROM}-01-01' AND '${YEAR_TO}-12-31';
INSERT INTO transactions (
  id_mutation, date_mutation, nature_mutation, valeur_fonciere,
  adresse, code_postal, code_commune, nom_commune, code_departement,
  id_parcelle, type_local, surface_bati, nb_pieces, surface_terrain,
  prefixe_section, section, no_plan, no_volume, nombre_lots, surface_carrez,
  prix_m2, longitude, latitude, geom, geo_precision
)
SELECT
  id_mutation,
  date_mutation::date,
  nature_mutation,
  NULLIF(valeur_fonciere,'')::numeric,
  trim(both ' ' from
       coalesce(adresse_numero,'') || ' ' ||
       coalesce(adresse_suffixe,'') || ' ' ||
       coalesce(adresse_nom_voie,'')),
  code_postal, code_commune, nom_commune, code_departement,
  id_parcelle,
  NULLIF(type_local,''),
  NULLIF(surface_reelle_bati,'')::numeric,
  NULLIF(nombre_pieces_principales,'')::int,
  NULLIF(surface_terrain,'')::numeric,
  -- parcel parts: derived from the 14-char id_parcelle (insee5+prefixe3+section2+plan4)
  CASE WHEN length(id_parcelle)=14 THEN substring(id_parcelle from 6 for 3) END,
  CASE WHEN length(id_parcelle)=14 THEN substring(id_parcelle from 9 for 2) END,
  CASE WHEN length(id_parcelle)=14 THEN substring(id_parcelle from 11 for 4) END,
  NULLIF(numero_volume,''),
  NULLIF(nombre_lots,'')::int,
  NULLIF(
    coalesce(NULLIF(lot1_surface_carrez,'')::numeric,0) + coalesce(NULLIF(lot2_surface_carrez,'')::numeric,0)
  + coalesce(NULLIF(lot3_surface_carrez,'')::numeric,0) + coalesce(NULLIF(lot4_surface_carrez,'')::numeric,0)
  + coalesce(NULLIF(lot5_surface_carrez,'')::numeric,0), 0),
  CASE
    WHEN NULLIF(valeur_fonciere,'')::numeric > 0
     AND coalesce(
           NULLIF(coalesce(NULLIF(lot1_surface_carrez,'')::numeric,0)+coalesce(NULLIF(lot2_surface_carrez,'')::numeric,0)
                 +coalesce(NULLIF(lot3_surface_carrez,'')::numeric,0)+coalesce(NULLIF(lot4_surface_carrez,'')::numeric,0)
                 +coalesce(NULLIF(lot5_surface_carrez,'')::numeric,0),0),
           NULLIF(surface_reelle_bati,'')::numeric) > 5
    THEN round(NULLIF(valeur_fonciere,'')::numeric
               / coalesce(
                   NULLIF(coalesce(NULLIF(lot1_surface_carrez,'')::numeric,0)+coalesce(NULLIF(lot2_surface_carrez,'')::numeric,0)
                         +coalesce(NULLIF(lot3_surface_carrez,'')::numeric,0)+coalesce(NULLIF(lot4_surface_carrez,'')::numeric,0)
                         +coalesce(NULLIF(lot5_surface_carrez,'')::numeric,0),0),
                   NULLIF(surface_reelle_bati,'')::numeric), 0)
    ELSE NULL
  END,
  NULLIF(longitude,'')::double precision,
  NULLIF(latitude,'')::double precision,
  ST_SetSRID(ST_MakePoint(NULLIF(longitude,'')::double precision,
                          NULLIF(latitude,'')::double precision), 4326),
  'source'
FROM dvf_raw
WHERE nature_mutation = 'Vente'         -- real sales only (skip exchanges/expropriations)
  AND longitude <> '' AND latitude <> ''
  AND valeur_fonciere <> '';
SQL

echo ">> Building indexes (spatial + lookups)..."
psql <<'SQL'
CREATE INDEX IF NOT EXISTS transactions_geom_gix    ON transactions USING GIST (geom);
CREATE INDEX IF NOT EXISTS transactions_commune_idx ON transactions (code_commune);
CREATE INDEX IF NOT EXISTS transactions_date_idx    ON transactions (date_mutation);
CREATE INDEX IF NOT EXISTS transactions_type_idx    ON transactions (type_local);
ANALYZE transactions;
SQL

echo ">> Done. Row count:"
psql -c "SELECT count(*) AS transactions FROM transactions;"
