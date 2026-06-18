#!/usr/bin/env python3
"""
Reference geometry for the geocoding pipeline. Stdlib only.

  communes --infile communes.json --out commune_centre.csv
      geo.api.gouv communes (fields=code,centre&geometry=centre) -> code_commune,lon,lat
  depts    --infile departements.geojson --out dept_geom.csv
      france-geojson departements -> code_departement,geom_json (GeoJSON geometry)
"""
import argparse
import csv
import json
import sys


def communes(a):
    data = json.load(open(a.infile, encoding="utf-8"))
    n = 0
    with open(a.out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code_commune", "lon", "lat"])
        for c in data:
            code = (c.get("code") or "").strip()
            centre = c.get("centre") or {}
            coords = centre.get("coordinates") or []
            if code and len(coords) == 2:
                w.writerow([code, coords[0], coords[1]])
                n += 1
    sys.stderr.write(f"  {n} commune centres -> {a.out}\n")


def depts(a):
    data = json.load(open(a.infile, encoding="utf-8"))
    feats = data.get("features", []) if isinstance(data, dict) else data
    n = 0
    with open(a.out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code_departement", "geom_json"])
        for ft in feats:
            props = ft.get("properties") or {}
            code = (props.get("code") or props.get("CODE_DEPT") or "").strip()
            geom = ft.get("geometry")
            if code and geom:
                w.writerow([code, json.dumps(geom, separators=(",", ":"))])
                n += 1
    sys.stderr.write(f"  {n} department polygons -> {a.out}\n")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="mode", required=True)
    pc = sub.add_parser("communes"); pc.add_argument("--infile", required=True); pc.add_argument("--out", required=True); pc.set_defaults(func=communes)
    pd = sub.add_parser("depts"); pd.add_argument("--infile", required=True); pd.add_argument("--out", required=True); pd.set_defaults(func=depts)
    a = p.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
