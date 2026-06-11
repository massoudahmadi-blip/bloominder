#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load fiber (FttH) coverage per commune from ARCEP into commune_livability.
#   ./load_fiber.sh
# % of premises FttH-connectable (ftth / locaux). Refresh URL from data.gouv
# "Le marché du haut et très haut débit fixe (déploiements)" each quarter.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

URL="https://static.data.gouv.fr/resources/le-marche-du-haut-et-tres-haut-debit-fixe-deploiements/20260313-073338/2025t4-commune.zip"

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Downloading ARCEP commune fiber file (~31 MB)..."
curl -fSL "$URL" -o "$DATA/fiber.zip"

echo ">> Computing fiber coverage per commune..."
python3 "$HERE/raw/fetch_fiber.py" --zip "$DATA/fiber.zip" --out "$DATA/fiber.csv"

echo ">> Loading into commune_livability.fiber_pct..."
psql -c "DROP TABLE IF EXISTS stg_fiber; CREATE TABLE stg_fiber(code_commune text, fiber_pct text);" >/dev/null
psql -c "\copy stg_fiber FROM '/data/fiber.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
psql -c "INSERT INTO commune_livability(code_commune, fiber_pct)
  SELECT code_commune, NULLIF(fiber_pct,'')::numeric FROM stg_fiber WHERE code_commune <> ''
  ON CONFLICT (code_commune) DO UPDATE SET fiber_pct = EXCLUDED.fiber_pct, updated_at = now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_fiber;" >/dev/null

echo ">> Done. Communes with fiber coverage:"
psql -c "SELECT count(*) AS communes, round(avg(fiber_pct),1) AS avg_pct FROM commune_livability WHERE fiber_pct IS NOT NULL;"
