#!/usr/bin/env python3
"""Reduce the SSMSI communal crime base (csv.gz) to a per-commune crime rate
(sum of taux pour mille across indicators, latest year). Standard library only.
Column-name detection makes it robust to header changes / suppressed values.

Usage:  fetch_crime.py --gz donnee.csv.gz --out crime.csv
"""
import argparse
import csv
import gzip
import sys

csv.field_size_limit(10_000_000)


def detect(fields, options):
    low = {f.lower().strip(): f for f in fields}
    for o in options:
        if o.lower() in low:
            return low[o.lower()]
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gz", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()

    agg: dict[tuple[str, int], float] = {}
    with gzip.open(a.gz, "rt", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        flds = reader.fieldnames or []
        codecol = detect(flds, ["CODGEO_2025", "CODGEO_2024", "CODGEO_2023", "CODGEO", "codgeo_2025", "codgeo"])
        yearcol = detect(flds, ["annee", "annee_geo", "year"])
        tauxcol = detect(flds, ["tauxpourmille", "taux_pour_mille", "taux pour mille", "tx_pm"])
        if not (codecol and yearcol and tauxcol):
            sys.stderr.write(f"  could not detect columns; headers: {flds}\n")
            sys.exit(1)
        for row in reader:
            code = (row.get(codecol) or "").strip()
            if not code:
                continue
            y = (row.get(yearcol) or "").strip()
            try:
                year = int(y)
                if year < 100:
                    year += 2000
            except ValueError:
                continue
            t = (row.get(tauxcol) or "").strip().replace(",", ".")
            try:
                taux = float(t)
            except ValueError:
                continue
            agg[(code, year)] = agg.get((code, year), 0.0) + taux

    latest: dict[str, int] = {}
    for (code, year) in agg:
        if year > latest.get(code, 0):
            latest[code] = year
    n = 0
    with open(a.out, "w", encoding="utf-8", newline="") as o:
        w = csv.writer(o)
        w.writerow(["code_commune", "crime_rate"])
        for code, year in latest.items():
            w.writerow([code, round(agg[(code, year)], 1)])
            n += 1
    sys.stderr.write(f"  {n} communes with a crime rate (latest year)\n")


if __name__ == "__main__":
    main()
