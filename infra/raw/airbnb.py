#!/usr/bin/env python3
"""Prepare Inside Airbnb 'listings.csv' for loading. Standard library only.

Modes:
  latlon --in listings.csv --out latlon.csv
         Extract id,latitude,longitude for BAN reverse-geocoding (→ commune).
  clean  --listings listings.csv --geo geo.csv --out clean.csv
         Join the reverse-geocoded citycode back and emit a clean CSV.
"""
import argparse
import csv
import sys

csv.field_size_limit(10_000_000)

CLEAN_HEADER = ["id", "code_commune", "room_type", "price", "min_nights", "n_reviews",
                "reviews_per_month", "availability_365", "neighbourhood", "license",
                "longitude", "latitude"]


def latlon(a):
    with open(a.infile, encoding="utf-8", errors="replace", newline="") as f, \
         open(a.out, "w", encoding="utf-8", newline="") as o:
        r = csv.DictReader(f)
        w = csv.writer(o)
        w.writerow(["id", "latitude", "longitude"])
        n = 0
        for row in r:
            if row.get("latitude") and row.get("longitude"):
                w.writerow([row.get("id"), row["latitude"], row["longitude"]])
                n += 1
    sys.stderr.write(f"  {n} listings to geocode\n")


def clean(a):
    citycode = {}
    with open(a.geo, encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            cc = row.get("result_citycode") or ""
            if row.get("id") and cc:
                citycode[row["id"]] = cc
    kept = 0
    with open(a.listings, encoding="utf-8", errors="replace", newline="") as f, \
         open(a.out, "w", encoding="utf-8", newline="") as o:
        r = csv.DictReader(f)
        w = csv.writer(o)
        w.writerow(CLEAN_HEADER)
        for row in r:
            cc = citycode.get(row.get("id", ""))
            if not cc:
                continue
            w.writerow([
                row.get("id"), cc, row.get("room_type"), row.get("price"),
                row.get("minimum_nights"), row.get("number_of_reviews"),
                row.get("reviews_per_month"), row.get("availability_365"),
                row.get("neighbourhood"), row.get("license"),
                row.get("longitude"), row.get("latitude"),
            ])
            kept += 1
    sys.stderr.write(f"  {kept} listings with a commune\n")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="mode", required=True)
    pl = sub.add_parser("latlon"); pl.add_argument("--in", dest="infile", required=True); pl.add_argument("--out", required=True); pl.set_defaults(func=latlon)
    pc = sub.add_parser("clean"); pc.add_argument("--listings", required=True); pc.add_argument("--geo", required=True); pc.add_argument("--out", required=True); pc.set_defaults(func=clean)
    a = p.parse_args(); a.func(a)


if __name__ == "__main__":
    main()
