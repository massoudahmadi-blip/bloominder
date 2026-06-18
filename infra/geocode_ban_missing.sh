#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Address-tier geocoding: place every transaction that still has NO coordinates
# (geom IS NULL) by geocoding its address through the French BAN bulk service.
# Runs department by department over the whole country; only distinct unlocated
# addresses are sent (cheap), and only matches with score >= 0.4 are kept.
# Sets geo_precision='address'. Idempotent — safe to re-run.
#
# Usage (from infra/, db up, internet):
#   ./geocode_ban_missing.sh             # every department with un-located sales
#   ./geocode_ban_missing.sh 75 13 69    # only these departments
# ---------------------------------------------------------------------------
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; BANDIR="$HERE/data/ban"; mkdir -p "$BANDIR"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
BAN="https://api-adresse.data.gouv.fr/search/csv/"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

psql -c "CREATE TABLE IF NOT EXISTS stg_ban(addr_key text, lat double precision, lon double precision, score double precision);" >/dev/null

if [ "$#" -gt 0 ]; then
  DEPTS=("$@")
else
  mapfile -t DEPTS < <(psql -tAc "SELECT DISTINCT code_departement FROM transactions
                                   WHERE geom IS NULL AND adresse IS NOT NULL AND adresse<>'' ORDER BY 1")
fi
echo ">> Address-geocoding ${#DEPTS[@]} department(s)."

KEY="md5(coalesce(adresse,'')||'|'||coalesce(code_postal,'')||'|'||coalesce(code_commune,''))"

for D in "${DEPTS[@]}"; do
  [ -z "$D" ] && continue
  addr="$BANDIR/addr_$D.csv"; geo="$BANDIR/geo_$D.csv"; slim="$BANDIR/geoslim_$D.csv"

  # 1) distinct un-located addresses for this department
  psql -c "\copy (SELECT $KEY AS addr_key, adresse AS q, coalesce(code_postal,'') AS code_postal,
                         coalesce(code_commune,'') AS citycode
                  FROM transactions
                  WHERE geom IS NULL AND code_departement='$D' AND adresse IS NOT NULL AND adresse<>''
                  GROUP BY adresse, code_postal, code_commune) TO STDOUT WITH CSV HEADER" > "$addr" 2>/dev/null
  n=$(($(wc -l < "$addr") - 1))
  if [ "$n" -le 0 ]; then echo "   dept $D: nothing to geocode"; rm -f "$addr"; continue; fi

  # 2) BAN bulk geocode (query = full address, filtered by postcode + citycode)
  if ! curl -sS -X POST \
        -F data=@"$addr" \
        -F columns=q \
        -F postcode=code_postal \
        -F citycode=citycode \
        -F result_columns=latitude -F result_columns=longitude -F result_columns=result_score \
        "$BAN" -o "$geo"; then
    echo "   dept $D: BAN request failed, skip"; continue
  fi

  # 3) keep good matches (score >= 0.4) → addr_key,lat,lon,score
  python3 "$HERE/raw/dvf_raw.py" slim --geocoded "$geo" --out "$slim" || { echo "   dept $D: slim fail"; continue; }

  # 4) join back and place (never overwrite an already-located row)
  psql -c "TRUNCATE stg_ban;" >/dev/null
  psql -c "\copy stg_ban FROM '/data/ban/geoslim_$D.csv' CSV HEADER" >/dev/null
  upd=$(psql -tAc "WITH up AS (
           UPDATE transactions t SET longitude=s.lon, latitude=s.lat,
                  geom=ST_SetSRID(ST_MakePoint(s.lon,s.lat),4326), geo_precision='address'
           FROM stg_ban s
           WHERE t.code_departement='$D' AND t.geom IS NULL
             AND s.lon IS NOT NULL AND s.lat IS NOT NULL
             AND $KEY = s.addr_key
           RETURNING 1) SELECT count(*) FROM up;")
  echo "   dept $D: $n addresses → located $upd transaction rows"
done

psql -c "DROP TABLE IF EXISTS stg_ban;" >/dev/null
echo ">> Address tier done."
