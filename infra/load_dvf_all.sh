#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load the official Etalab "DVF géolocalisé" for ALL departments over a year
# range. Unlike the cquest raw + address-geocoding path, geo-DVF already carries
# longitude/latitude (parcel-based) for ~all mutations — so far fewer missing
# dots on the map.
#
# Usage (from infra/, db up, internet):  ./load_dvf_all.sh <year_from> <year_to>
#   e.g. ./load_dvf_all.sh 2019 2025
# Then: ./compute_metrics.sh
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
YF="${1:?Usage: ./load_dvf_all.sh <year_from> <year_to>}"
YT="${2:?need YEAR_TO}"

DEPTS=()
for n in $(seq -w 1 95); do [ "$n" = "20" ] && continue; DEPTS+=("$n"); done
DEPTS+=(2A 2B 971 972 973 974 976)

echo ">> Loading geo-DVF for ${#DEPTS[@]} departments, ${YF}–${YT}..."
for d in "${DEPTS[@]}"; do
  echo "==== Département $d ===="
  "$HERE/load_dvf.sh" "$d" "$YF" "$YT" || echo "   (skipped $d)"
done
echo ">> All departments done. Now run ./compute_metrics.sh"
