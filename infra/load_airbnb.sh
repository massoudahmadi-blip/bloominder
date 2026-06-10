#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load Inside Airbnb short-term-rental data for covered French cities, assign
# each listing to its commune (BAN reverse-geocode), and aggregate per-commune
# short-let stats (median nightly, % entire home, estimated occupancy & revenue).
#
#   ./load_airbnb.sh                         # built-in city list
#   ./load_airbnb.sh <listings_csv_url> ...  # override with specific city URLs
#
# Inside Airbnb URLs embed a snapshot date — refresh the list from
# https://insideairbnb.com/get-the-data/ periodically. Legal public source.
# Occupancy/revenue are ESTIMATES (reviews-based proxy), clearly labelled.
# ---------------------------------------------------------------------------
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data/airbnb"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
BAN_REVERSE="https://api-adresse.data.gouv.fr/reverse/csv/"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

# Default covered cities (refresh dates from insideairbnb.com/get-the-data).
DEFAULT_CITIES=(
  "https://data.insideairbnb.com/france/auvergne-rhone-alpes/lyon/2025-09-18/visualisations/listings.csv"
  "https://data.insideairbnb.com/france/nouvelle-aquitaine/bordeaux/2025-09-18/visualisations/listings.csv"
)
if [ "$#" -gt 0 ]; then CITIES=("$@"); else CITIES=("${DEFAULT_CITIES[@]}"); fi

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_airbnb;
CREATE TABLE stg_airbnb(id text,code_commune text,room_type text,price text,min_nights text,
  n_reviews text,reviews_per_month text,availability_365 text,neighbourhood text,license text,
  longitude text,latitude text);" >/dev/null

for url in "${CITIES[@]}"; do
  city="$(echo "$url" | sed -E 's#.*/france/[^/]+/([^/]+)/[0-9-]+/.*#\1#')"
  echo ">> $city ..."
  curl -fsSL "$url" -o "$DATA/${city}_listings.csv" || { echo "   download failed"; continue; }
  python3 "$HERE/raw/airbnb.py" latlon --in "$DATA/${city}_listings.csv" --out "$DATA/${city}_latlon.csv"
  curl -sS -X POST -F data=@"$DATA/${city}_latlon.csv" "$BAN_REVERSE" -o "$DATA/${city}_geo.csv"
  if ! head -1 "$DATA/${city}_geo.csv" | grep -q result_citycode; then
    echo "   reverse-geocode failed for $city — skipping"; continue
  fi
  python3 "$HERE/raw/airbnb.py" clean --listings "$DATA/${city}_listings.csv" --geo "$DATA/${city}_geo.csv" --out "$DATA/${city}_clean.csv"
  psql -c "TRUNCATE stg_airbnb;" >/dev/null
  psql -c "\copy stg_airbnb FROM '/data/airbnb/${city}_clean.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
  psql >/dev/null <<'SQL'
INSERT INTO airbnb_listings(id,code_commune,room_type,price,min_nights,n_reviews,reviews_per_month,availability_365,neighbourhood,license,longitude,latitude)
SELECT NULLIF(id,'')::bigint, NULLIF(code_commune,''), NULLIF(room_type,''),
       NULLIF(price,'')::numeric, NULLIF(min_nights,'')::int, NULLIF(n_reviews,'')::int,
       NULLIF(reviews_per_month,'')::numeric, NULLIF(availability_365,'')::int,
       NULLIF(neighbourhood,''), NULLIF(license,''),
       NULLIF(longitude,'')::double precision, NULLIF(latitude,'')::double precision
FROM stg_airbnb WHERE id <> ''
ON CONFLICT (id) DO UPDATE SET code_commune=EXCLUDED.code_commune, price=EXCLUDED.price,
  reviews_per_month=EXCLUDED.reviews_per_month, availability_365=EXCLUDED.availability_365,
  room_type=EXCLUDED.room_type;
SQL
done

psql -c "DROP TABLE IF EXISTS stg_airbnb;" >/dev/null

echo ">> Aggregating commune short-let stats..."
psql >/dev/null <<'SQL'
TRUNCATE commune_airbnb;
INSERT INTO commune_airbnb(code_commune,listings,median_nightly,pct_entire,median_occupancy,median_revenue_year)
SELECT code_commune, count(*),
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price) FILTER (WHERE room_type='Entire home/apt' AND price>0)),
  round(100.0 * count(*) FILTER (WHERE room_type='Entire home/apt') / count(*), 1),
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY occ)),
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY rev))
FROM (
  SELECT code_commune, room_type, price,
    LEAST(reviews_per_month * 72, 270) / 365.0 * 100 AS occ,        -- 1/0.5 review rate × 3 nights, capped
    price * LEAST(reviews_per_month * 72, 270)       AS rev
  FROM airbnb_listings
  WHERE code_commune IS NOT NULL
) x
GROUP BY code_commune;
SQL

echo ">> Done. Listings + top short-let communes:"
psql -c "SELECT count(*) AS listings, count(DISTINCT code_commune) AS communes FROM airbnb_listings;"
psql -c "SELECT ca.code_commune, ca.listings, ca.median_nightly, ca.pct_entire, ca.median_occupancy, ca.median_revenue_year
FROM commune_airbnb ca WHERE ca.listings >= 50 ORDER BY ca.median_revenue_year DESC NULLS LAST LIMIT 12;"
