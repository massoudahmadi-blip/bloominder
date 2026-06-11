#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load INSEE BPE (équipements) per commune into commune_livability:
# health (domain D) + transport (domain E) + total facility counts.
#
#   ./load_bpe.sh <bpe_zip_url>
#
# Get the URL from INSEE (hrefs aren't exposed to scrapers): open
#   https://www.insee.fr/fr/statistiques/8217525   (Équipements géolocalisés 2024)
# or https://www.insee.fr/fr/statistiques/8217527   (Dénombrement 2024),
# copy the commune-level CSV/zip download link, and pass it here. The parser
# auto-detects DEPCOM/TYPEQU columns, so either the geolocated or the
# dénombrement file works.
# ---------------------------------------------------------------------------
set -euo pipefail

URL="${1:?Usage: ./load_bpe.sh <bpe_zip_url>  (get it from insee.fr page 8217525 or 8217527)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Downloading BPE zip..."
curl -fSL "$URL" -o "$DATA/bpe.zip"

echo ">> Aggregating per commune (health / transport / total)..."
python3 "$HERE/raw/fetch_bpe.py" --zip "$DATA/bpe.zip" --out "$DATA/bpe.csv"

echo ">> Loading into commune_livability..."
psql -c "DROP TABLE IF EXISTS stg_bpe;
CREATE TABLE stg_bpe(code_commune text, health_equip text, transport_equip text, total_equip text);" >/dev/null
psql -c "\copy stg_bpe FROM '/data/bpe.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
psql -c "INSERT INTO commune_livability(code_commune, health_equip, transport_equip, total_equip)
  SELECT code_commune, NULLIF(health_equip,'')::int, NULLIF(transport_equip,'')::int, NULLIF(total_equip,'')::int
  FROM stg_bpe WHERE code_commune <> ''
  ON CONFLICT (code_commune) DO UPDATE
    SET health_equip=EXCLUDED.health_equip, transport_equip=EXCLUDED.transport_equip,
        total_equip=EXCLUDED.total_equip, updated_at=now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_bpe;" >/dev/null

echo ">> Done. Communes with BPE data:"
psql -c "SELECT count(*) AS communes, sum(health_equip) AS health, sum(transport_equip) AS transport FROM commune_livability WHERE total_equip IS NOT NULL;"
