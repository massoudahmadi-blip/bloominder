#!/usr/bin/env python3
"""
Parse an INSEE "recensement" base CSV (semicolon, with header) and emit a clean
per-commune CSV of housing-structure + unemployment indicators, picking columns
by NAME (robust to the 100+ columns / yearly renames).

INSEE column codes are year-prefixed (e.g. P21_*). Pass --year 21 to match.

Usage:
  # housing (base-cc-logement):
  python3 fetch_insee_rp.py --infile log.csv --out clean.csv --year 21 --kind logement
  # employment (base-cc-emploi-pop-active):
  python3 fetch_insee_rp.py --infile emp.csv --out clean.csv --year 21 --kind emploi
"""
import argparse
import csv
import sys


def num(v):
    v = (v or '').strip().replace(',', '.')
    try:
        return float(v)
    except ValueError:
        return None


def pct(a, b):
    a, b = num(a), num(b)
    return round(a / b * 100, 1) if a is not None and b and b > 0 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--infile', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--year', default='21')
    ap.add_argument('--kind', choices=['logement', 'emploi'], required=True)
    a = ap.parse_args()
    y = a.year

    n = 0
    with open(a.infile, encoding='utf-8', errors='replace', newline='') as f, \
         open(a.out, 'w', encoding='utf-8', newline='') as fo:
        reader = csv.DictReader(f, delimiter=';')
        w = csv.writer(fo)
        if a.kind == 'logement':
            w.writerow(['code_commune', 'owner_pct', 'renter_pct', 'vacancy_pct', 'secondary_pct'])
        else:
            w.writerow(['code_commune', 'unemployment_pct'])
        for row in reader:
            code = (row.get('CODGEO') or row.get('codgeo') or '').strip()
            if not code:
                continue
            if a.kind == 'logement':
                log = row.get(f'P{y}_LOG'); rp = row.get(f'P{y}_RP')
                w.writerow([
                    code,
                    pct(row.get(f'P{y}_RP_PROP'), rp),
                    pct(row.get(f'P{y}_RP_LOC'), rp),
                    pct(row.get(f'P{y}_LOGVAC'), log),
                    pct(row.get(f'P{y}_RSECOCC'), log),
                ])
            else:
                w.writerow([code, pct(row.get(f'P{y}_CHOM1564'), row.get(f'P{y}_ACT1564'))])
            n += 1
    sys.stderr.write(f'  wrote {n} communes ({a.kind}) -> {a.out}\n')


if __name__ == '__main__':
    main()
