#!/usr/bin/env python3
"""
Aggregate Sit@del building-permits (logements autorisés) to an average number of
authorised dwellings per year per commune. Reads one or more Sit@del CSVs from
statistiques.developpement-durable.gouv.fr / data.gouv.fr, auto-detecting the
commune-code, period/date and dwellings-count columns.  Stdlib only.

Usage: python3 fetch_sitadel.py --out permits.csv --infiles a.csv [b.csv ...]
"""
import argparse
import csv
import sys

CODE_KEYS = ['comm', 'code_commune', 'code_insee', 'depcom', 'codgeo', 'insee']
DATE_KEYS = ['date_reelle_autorisation', 'mois', 'periode', 'annee', 'datedepot', 'date']
# number of dwellings created/authorised by the permit
NLOG_KEYS = ['nb_lgt_tot_crees', 'nb_logements', 'logements', 'nb_lgt', 'nblogtaut', 'i_nb_lgt_tot_crees']


def norm(s):
    s = (s or '').strip().lower()
    for a, b in [('é', 'e'), ('è', 'e'), ('ê', 'e'), ('à', 'a'), ('â', 'a'),
                 ("'", '_'), (' ', '_'), ('-', '_'), ('.', ''), ('°', ''), ('(', ''), (')', '')]:
        s = s.replace(a, b)
    return s


def pick(headers, keys):
    nmap = {norm(h): h for h in headers}
    for k in keys:
        if k in nmap:
            return nmap[k]
    for nk, h in nmap.items():
        if any(k in nk for k in keys):
            return h
    return None


def year_of(s):
    s = (s or '').strip()
    for i in range(len(s) - 3):
        chunk = s[i:i + 4]
        if chunk.isdigit() and 1990 <= int(chunk) <= 2100:
            return int(chunk)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--infiles', nargs='+', required=True)
    a = ap.parse_args()

    # code -> {year -> dwellings}
    by_commune = {}
    for path in a.infiles:
        with open(path, encoding='utf-8', errors='replace', newline='') as f:
            first = f.readline()
            delim = ';' if first.count(';') >= first.count(',') else ','
            f.seek(0)
            reader = csv.DictReader(f, delimiter=delim)
            ck = pick(reader.fieldnames or [], CODE_KEYS)
            dk = pick(reader.fieldnames or [], DATE_KEYS)
            nk = pick(reader.fieldnames or [], NLOG_KEYS)
            if not ck or not nk:
                sys.stderr.write(f'  ! {path}: could not find code/dwellings columns in {reader.fieldnames}\n')
                continue
            for row in reader:
                code = (row.get(ck) or '').strip()
                if len(code) >= 5:
                    code = code[:5]
                if not code:
                    continue
                yr = year_of(row.get(dk)) if dk else None
                v = (row.get(nk) or '').strip().replace(',', '.')
                try:
                    n = float(v)
                except ValueError:
                    continue
                yrs = by_commune.setdefault(code, {})
                yrs[yr] = yrs.get(yr, 0.0) + n

    n_out = 0
    with open(a.out, 'w', encoding='utf-8', newline='') as fo:
        w = csv.writer(fo)
        w.writerow(['code_commune', 'permits_logements', 'permits_year'])
        for code, yrs in by_commune.items():
            real_years = [y for y in yrs if y is not None]
            if real_years:
                avg = sum(yrs[y] for y in real_years) / len(real_years)
                last = max(real_years)
            else:
                avg = sum(yrs.values())
                last = ''
            w.writerow([code, round(avg, 1), last])
            n_out += 1
    sys.stderr.write(f'  {n_out} communes with permit data -> {a.out}\n')


if __name__ == '__main__':
    main()
