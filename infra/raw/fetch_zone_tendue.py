#!/usr/bin/env python3
"""
Fetch the national "zones tendues" reference (DILA service-public simulator,
hosted on GitLab) and emit a CSV of INSEE codes flagged as zone tendue.

A commune is in zone tendue when the reduced tenant notice applies
(preavis == 1) — the defining consequence of the tension décret. Stdlib only.

Usage: python3 fetch_zone_tendue.py --out /data/zone_tendue.csv
"""
import argparse
import csv
import json
import sys
import urllib.request

URL = "https://gitlab.com/pidila/sp-simulateurs-data/-/raw/master/donnees-de-reference/zonage-commune.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--url", default=URL)
    a = ap.parse_args()

    req = urllib.request.Request(a.url, headers={"User-Agent": "Mozilla/5.0 (Bloominder)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        rows = json.load(r)

    n = 0
    with open(a.out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code_commune", "zone_abc"])
        for rec in rows:
            code = str(rec.get("codeInsee") or "").strip()
            if not code:
                continue
            tendue = int(rec.get("preavis") or 0) == 1 or int(rec.get("frais") or 0) == 1
            if tendue:
                w.writerow([code, rec.get("zone") or ""])
                n += 1
    sys.stderr.write(f"  {len(rows)} communes scanned, {n} in zone tendue -> {a.out}\n")


if __name__ == "__main__":
    main()
