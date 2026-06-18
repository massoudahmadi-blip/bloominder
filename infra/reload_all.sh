#!/usr/bin/env bash
# ===========================================================================
# FULL REBUILD of `transactions` for all of France, 2014–2025, then place every
# sale on its cadastral parcel and verify. Run from infra/, db up, under tmux.
#
#   Phase 1  recent years 2021–2025  → geo-DVF (Etalab, already geolocated)
#   Phase 2  history    2014–2020    → raw DGFiP DVF (cquest, no coords)
#            - 2014–2018 from millésime 201904
#            - 2019–2020 from millésime 202110 (latest corrected)
#            captures parcel parts + condo lots + Carrez surface
#   Phase 3  PLACE      cadastral-parcel-authoritative geocoding + QA report
#            (parcel overrides a contradicting address; BAN then commune-centre
#             fallback; nothing dropped)
#   Phase 4  DERIVE     resales, DPE match, commune metrics/scores
#
# Long-running (several hours, ~2 GB downloads). Idempotent & resumable: a year
# that fails does not abort the run; re-running replaces each slice.
#
# Usage:
#   tmux new -s reload
#   ./reload_all.sh
# Options (env):
#   SKIP_RECENT=1   skip phase 1     SKIP_HIST=1   skip phase 2
#   SKIP_PLACE=1    skip phase 3     SKIP_DERIVE=1 skip phase 4
#   KEEP_DOWNLOADS=1  reuse cached raw .txt (do NOT re-download ~300 MB/year)
# ===========================================================================
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

RECENT_FROM=2021; RECENT_TO=2025
# year:millésime for the raw historical files on data.cquest.org
HIST=( 2014:201904 2015:201904 2016:201904 2017:201904 2018:201904 2019:202110 2020:202110 )
REFRESH_FLAG=1; [ "${KEEP_DOWNLOADS:-0}" = "1" ] && REFRESH_FLAG=0

echo "############ PHASE 0: schema + reference geometry ############"
psql < "$HERE/invest_schema.sql" >/dev/null
if [ "$(psql -tAc 'SELECT count(*) FROM commune_centre' 2>/dev/null || echo 0)" = "0" ]; then
  bash "$HERE/load_geo_ref.sh"
fi

if [ "${SKIP_RECENT:-0}" != "1" ]; then
  echo "############ PHASE 1: geo-DVF ${RECENT_FROM}-${RECENT_TO} (all departments) ############"
  bash "$HERE/load_dvf_all.sh" "$RECENT_FROM" "$RECENT_TO" || echo "   (phase 1 had failures — continuing)"
fi

if [ "${SKIP_HIST:-0}" != "1" ]; then
  echo "############ PHASE 2: raw DGFiP DVF 2014-2020 (no coords) ############"
  for entry in "${HIST[@]}"; do
    Y="${entry%%:*}"; M="${entry##*:}"
    URL="https://data.cquest.org/dgfip_dvf/${M}/valeursfoncieres-${Y}.txt"
    echo "--- $Y (millésime $M) ---"
    REFRESH="$REFRESH_FLAG" bash "$HERE/load_dvf_hist.sh" "$Y" "$URL" || echo "   ($Y failed — continuing)"
  done
fi

if [ "${SKIP_PLACE:-0}" != "1" ]; then
  echo "############ PHASE 3: parcel-authoritative placement + QA ############"
  bash "$HERE/fix_geocoding.sh" || echo "   (placement had failures — continuing)"
fi

if [ "${SKIP_DERIVE:-0}" != "1" ]; then
  echo "############ PHASE 4: derived data (resales, DPE, metrics) ############"
  [ -x "$HERE/compute_resales.sh" ] && { bash "$HERE/compute_resales.sh" || echo "   (resales failed)"; }
  [ -x "$HERE/match_dpe.sh" ]       && { bash "$HERE/match_dpe.sh"       || echo "   (dpe match failed)"; }
  bash "$HERE/compute_metrics.sh" || echo "   (metrics failed)"
fi

echo "############ DONE ############"
psql -c "SELECT count(*) AS transactions,
                count(geom) AS located,
                round(100.0*count(geom)/nullif(count(*),0),2) AS located_pct,
                min(date_mutation), max(date_mutation) FROM transactions;"
psql -c "SELECT coalesce(geo_precision,'(unlocated)') AS precision, count(*)
         FROM transactions GROUP BY 1 ORDER BY 2 DESC;"
