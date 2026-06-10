#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load livability (cadre de vie) per commune. v1 = schools from the
# Éducation Nationale directory. Quick + light.
#   ./load_livability.sh
# Crime (SSMSI), healthcare (DREES/BPE), transport, fiber to be added later.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

URL="https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/exports/csv?select=code_commune,libelle_nature,etat,appartenance_education_prioritaire&delimiter=%3B"

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Downloading schools (Éducation Nationale)..."
curl -fSL "$URL" -o "$DATA/schools.csv"

echo ">> Loading into commune_livability..."
psql -c "DROP TABLE IF EXISTS stg_schools;
CREATE TABLE stg_schools(code_commune text, libelle_nature text, etat text, ep text);" >/dev/null
psql -c "\copy stg_schools FROM '/data/schools.csv' WITH (FORMAT csv, DELIMITER ';', HEADER true)" >/dev/null
psql -c "INSERT INTO commune_livability(code_commune,schools,ecoles,colleges,lycees,education_prioritaire)
  SELECT code_commune,
    count(*) FILTER (WHERE etat='OUVERT'),
    count(*) FILTER (WHERE etat='OUVERT' AND libelle_nature ILIKE 'ECOLE%'),
    count(*) FILTER (WHERE etat='OUVERT' AND libelle_nature ILIKE 'COLLEGE%'),
    count(*) FILTER (WHERE etat='OUVERT' AND libelle_nature ILIKE 'LYCEE%'),
    bool_or(NULLIF(ep,'') IS NOT NULL)
  FROM stg_schools WHERE code_commune <> ''
  GROUP BY code_commune
  ON CONFLICT (code_commune) DO UPDATE
    SET schools=EXCLUDED.schools, ecoles=EXCLUDED.ecoles, colleges=EXCLUDED.colleges,
        lycees=EXCLUDED.lycees, education_prioritaire=EXCLUDED.education_prioritaire, updated_at=now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_schools;" >/dev/null

echo ">> Done. Communes with schools:"
psql -c "SELECT count(*) AS communes, sum(schools) AS schools_total, sum(colleges) AS colleges, sum(lycees) AS lycees FROM commune_livability;"
