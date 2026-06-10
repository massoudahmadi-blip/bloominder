#!/usr/bin/env python3
"""Fetch current population per commune from the French government Geo API
(geo.api.gouv.fr) and write a clean CSV. Standard library only.

Usage:  fetch_insee.py out.csv
"""
import csv
import json
import sys
import urllib.request

URL = "https://geo.api.gouv.fr/communes?fields=code,population,codeDepartement&format=json"


def main(out: str) -> None:
    req = urllib.request.Request(URL, headers={"User-Agent": "bloominder/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.load(r)
    n = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code_commune", "code_departement", "population"])
        for c in data:
            pop = c.get("population")
            if pop is None:
                continue
            w.writerow([c.get("code"), c.get("codeDepartement"), pop])
            n += 1
    sys.stderr.write(f"  {n} communes with population\n")


if __name__ == "__main__":
    main(sys.argv[1])
