#!/usr/bin/env python3
"""Fetch a compact environmental-risk summary per commune from the Géorisques API.
Standard library only. Rate-limited and defensive (skips failures).

Usage:  fetch_georisques.py --codes codes.txt --out risk.csv
  codes.txt: one INSEE code per line.
"""
import argparse
import csv
import json
import sys
import time
import urllib.request

BASE = "https://www.georisques.gouv.fr/api/v1"


def get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "bloominder-risk/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def risks_for(code: str):
    seismic, labels = None, []
    try:
        payload = get(f"{BASE}/gaspar/risques?code_insee={code}&page=1&page_size=50")
        records = payload.get("data") or []
        rd = None
        if records:
            rec = records[0]
            rd = rec.get("risques_detail") if isinstance(rec, dict) else None
            if rd is None and isinstance(rec, dict) and "libelle_risque_long" in rec:
                rd = records  # data is directly the risk list
        for it in (rd or []):
            if not isinstance(it, dict):
                continue
            z = it.get("zone_sismicite")
            if z:
                seismic = str(z)
            nr = str(it.get("num_risque") or "")
            lab = it.get("libelle_risque_long")
            if len(nr) == 2 and lab:
                labels.append(lab)
    except Exception:
        pass
    return seismic, sorted(set(labels))


def icpe_for(code: str):
    total, seveso = 0, 0
    try:
        payload = get(f"{BASE}/installations_classees?code_insee={code}&page=1&page_size=500")
        total = payload.get("results") or 0
        for it in (payload.get("data") or []):
            st = (it.get("statutSeveso") or "").strip()
            if st and not st.lower().startswith("non"):
                seveso += 1
    except Exception:
        pass
    return total, seveso


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--codes", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    codes = [l.strip() for l in open(a.codes, encoding="utf-8") if l.strip()]
    n = 0
    with open(a.out, "w", encoding="utf-8", newline="") as o:
        w = csv.writer(o)
        w.writerow(["code_commune", "seismic_zone", "risks", "icpe_count", "seveso_count"])
        for code in codes:
            seismic, labels = risks_for(code)
            total, seveso = icpe_for(code)
            w.writerow([code, seismic or "", " · ".join(labels), total, seveso])
            n += 1
            if n % 50 == 0:
                sys.stderr.write(f"\r  {n}/{len(codes)} communes")
            time.sleep(0.25)  # be polite to the API
    sys.stderr.write(f"\r  {n} communes done\n")


if __name__ == "__main__":
    main()
