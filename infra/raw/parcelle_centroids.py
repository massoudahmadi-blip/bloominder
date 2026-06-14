#!/usr/bin/env python3
"""
Read an Etalab cadastre "parcelles" GeoJSON (one commune) and emit a CSV of
parcel-id → centroid (lon, lat). Used to locate DVF transactions by their
cadastral parcel when address geocoding failed. Stdlib only.

Usage: python3 parcelle_centroids.py --infile cadastre-13055-parcelles.json --out out.csv
"""
import argparse
import csv
import json
import sys


def centroid(geom):
    ring = None
    if not geom:
        return None
    if geom.get('type') == 'Polygon':
        ring = geom['coordinates'][0]
    elif geom.get('type') == 'MultiPolygon':
        for poly in geom['coordinates']:
            if ring is None or len(poly[0]) > len(ring):
                ring = poly[0]
    if not ring:
        return None
    lon = sum(c[0] for c in ring) / len(ring)
    lat = sum(c[1] for c in ring) / len(ring)
    return lon, lat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--infile', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    with open(a.infile, encoding='utf-8') as f:
        data = json.load(f)
    n = 0
    with open(a.out, 'w', encoding='utf-8', newline='') as fo:
        w = csv.writer(fo)
        w.writerow(['id_parcelle', 'lon', 'lat'])
        for feat in data.get('features', []):
            pid = (feat.get('properties') or {}).get('id')
            c = centroid(feat.get('geometry'))
            if pid and c:
                w.writerow([pid, round(c[0], 6), round(c[1], 6)])
                n += 1
    sys.stderr.write(f'  {n} parcel centroids -> {a.out}\n')


if __name__ == '__main__':
    main()
