#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Place EVERY DVF transaction in France, best source first, then verify.
# Runs the full geocoding ladder nationwide and prints the QA report at the end.
#
#   tier 0  source   native geo-DVF coords already loaded            (tagged)
#   tier 1  parcel    cadastral parcel centroid by id_parcelle       (backfill_geom.sh)
#   tier 2  address   BAN geocode of the address                     (geocode_ban_missing.sh)
#   tier 3  commune   commune centre — last resort, low precision    (commune_centre)
#
# A better tier is never overwritten by a worse one (each only touches geom NULL).
# Long-running over the whole country — run under tmux.  Idempotent.
#
# Usage (from infra/, db up, internet):
#   ./fix_geocoding.sh                 # full national run
#   SKIP_COMMUNE=1 ./fix_geocoding.sh  # leave the truly-unplaceable as NULL
# ---------------------------------------------------------------------------
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo "==> [0/4] schema + reference geometry"
psql < "$HERE/invest_schema.sql" >/dev/null
if [ "$(psql -tAc 'SELECT count(*) FROM commune_centre')" = "0" ]; then
  bash "$HERE/load_geo_ref.sh"
fi
# Tag already-geolocated rows (native geo-DVF coords) as the best tier.
psql -c "UPDATE transactions SET geo_precision='source' WHERE geom IS NOT NULL AND geo_precision IS NULL;" >/dev/null

echo "==> [1/4] parcel tier (cadastre centroid)"
bash "$HERE/backfill_geom.sh" || echo "   (parcel tier returned non-zero — continuing)"

echo "==> [2/4] address tier (BAN)"
bash "$HERE/geocode_ban_missing.sh" || echo "   (address tier returned non-zero — continuing)"

if [ "${SKIP_COMMUNE:-0}" = "1" ]; then
  echo "==> [3/4] commune tier SKIPPED (SKIP_COMMUNE=1)"
else
  echo "==> [3/4] commune tier (commune centre, low precision)"
  placed=$(psql -tAc "WITH up AS (
      UPDATE transactions t SET geom=c.geom, longitude=c.lon, latitude=c.lat, geo_precision='commune'
      FROM commune_centre c
      WHERE t.geom IS NULL AND t.code_commune = c.code_commune
      RETURNING 1) SELECT count(*) FROM up;")
  echo "   placed $placed remaining rows at commune centre"
fi

echo "==> [4/4] verification"
bash "$HERE/qa_coverage.sh"
echo "==> Done. Re-run ./compute_metrics.sh if placements changed the metrics."
