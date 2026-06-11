#!/usr/bin/env python3
"""Aggregate INSEE BPE (Base Permanente des Équipements) per commune from a zip.
Standard library only. Robust: reads every CSV in the zip, detects the DEPCOM /
TYPEQU columns and an optional count column, and sums per commune by BPE domain:
  D = santé (health), E = transport. Also a total.

Usage:  fetch_bpe.py --zip BPE.zip --out bpe.csv
"""
import argparse
import csv
import io
import sys
import zipfile


def detect(fields, opts):
    low = {f.lower().strip(): f for f in fields}
    for o in opts:
        if o in low:
            return low[o]
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--zip", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()

    health: dict[str, int] = {}
    transport: dict[str, int] = {}
    total: dict[str, int] = {}

    z = zipfile.ZipFile(a.zip)
    for name in z.namelist():
        if not name.lower().endswith(".csv"):
            continue
        raw = z.read(name)
        text = io.TextIOWrapper(io.BytesIO(raw), encoding="utf-8", errors="replace", newline="")
        first = text.readline()
        delim = ";" if first.count(";") >= first.count(",") else ","
        text.seek(0)
        reader = csv.DictReader(text, delimiter=delim)
        flds = reader.fieldnames or []
        depcol = detect(flds, ["depcom", "codgeo", "code_commune", "dep_com", "com"])
        typecol = detect(flds, ["typequ", "type_equ", "typeequip"])
        nbcol = detect(flds, ["nb_equip", "nb", "nombre", "nb_2024", "nb_equipements"])
        if not (depcol and typecol):
            continue
        sys.stderr.write(f"  reading {name} (depcom={depcol}, typequ={typecol}, nb={nbcol})\n")
        for row in reader:
            code = (row.get(depcol) or "").strip()
            if not code:
                continue
            tq = (row.get(typecol) or "").strip().upper()
            n = 1
            if nbcol:
                try:
                    n = int(float((row.get(nbcol) or "0").replace(",", ".")))
                except ValueError:
                    n = 0
            total[code] = total.get(code, 0) + n
            if tq.startswith("D"):
                health[code] = health.get(code, 0) + n
            elif tq.startswith("E"):
                transport[code] = transport.get(code, 0) + n

    with open(a.out, "w", encoding="utf-8", newline="") as o:
        w = csv.writer(o)
        w.writerow(["code_commune", "health_equip", "transport_equip", "total_equip"])
        for code in total:
            w.writerow([code, health.get(code, 0), transport.get(code, 0), total[code]])
    sys.stderr.write(f"  {len(total)} communes aggregated\n")


if __name__ == "__main__":
    main()
