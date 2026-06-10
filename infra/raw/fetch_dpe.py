#!/usr/bin/env python3
"""Fetch ADEME DPE records (dpe03existant) for one department via the data-fair API,
writing a clean CSV ready for loading. Standard library only.

Usage:  fetch_dpe.py --dept 13 --out dpe_13.csv

Pulls only the fields we need, paginates via the API's `next` cursor, and converts
the DPE date to ISO. Coordinates stay in Lambert-93 (EPSG:2154) and are projected to
WGS84 at load time in PostGIS.
"""
import argparse
import csv
import json
import sys
import urllib.parse
import urllib.request

BASE = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines"
FIELDS = [
    "numero_dpe", "date_etablissement_dpe", "type_batiment", "etiquette_dpe", "etiquette_ges",
    "surface_habitable_immeuble", "code_insee_ban", "code_postal_ban",
    "coordonnee_cartographique_x_ban", "coordonnee_cartographique_y_ban",
]


def fetch(dept: str, out: str) -> None:
    params = {
        "size": "10000",
        "select": ",".join(FIELDS),
        "qs": f'code_departement_ban:"{dept}"',
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    n = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["numero_dpe", "date_dpe", "type_batiment", "etiquette_dpe", "etiquette_ges",
                    "surface", "code_commune", "code_postal", "x", "y"])
        while url:
            req = urllib.request.Request(url, headers={"User-Agent": "bloominder-dpe/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
            for row in data.get("results", []):
                label = row.get("etiquette_dpe")
                if not label:
                    continue
                w.writerow([
                    row.get("numero_dpe"),
                    (row.get("date_etablissement_dpe") or "")[:10],
                    row.get("type_batiment"),
                    label,
                    row.get("etiquette_ges"),
                    row.get("surface_habitable_immeuble"),
                    row.get("code_insee_ban"),
                    row.get("code_postal_ban"),
                    row.get("coordonnee_cartographique_x_ban"),
                    row.get("coordonnee_cartographique_y_ban"),
                ])
                n += 1
            url = data.get("next")
            sys.stderr.write(f"\r  dept {dept}: {n} DPE...")
    sys.stderr.write("\n")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--dept", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    fetch(a.dept, a.out)


if __name__ == "__main__":
    main()
