#!/usr/bin/env python3
"""
Aggregate school IPS (indice de position sociale, Éducation Nationale) to a mean
per commune. Reads one or more per-établissement CSVs (écoles/collèges/lycées),
auto-detecting the commune-code and IPS columns (delimiter + header variants).
Stdlib only.

Usage: python3 fetch_ips.py --out ips.csv --infiles a.csv b.csv c.csv
"""
import argparse
import csv
import sys

CODE_KEYS = ['code_insee_de_la_commune', 'code_commune', 'code_insee', 'depcom', 'codgeo', 'code_insee_commune']
IPS_KEYS = ['ips', 'indice_de_position_sociale', 'ips_ensemble_gt_pro', 'ips_voie_gt', 'ips_etablissement']


def norm(s):
    s = (s or '').strip().lower()
    for a, b in [('é', 'e'), ('è', 'e'), ('ê', 'e'), ('à', 'a'), ('â', 'a'), ("'", '_'), (' ', '_'), ('-', '_'), ('.', ''), ('°', ''), ('(', ''), (')', '')]:
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--infiles', nargs='+', required=True)
    a = ap.parse_args()

    agg = {}  # code -> [sum, count]
    for path in a.infiles:
        with open(path, encoding='utf-8', errors='replace', newline='') as f:
            first = f.readline()
            delim = ';' if first.count(';') >= first.count(',') else ','
            f.seek(0)
            reader = csv.DictReader(f, delimiter=delim)
            ck = pick(reader.fieldnames or [], CODE_KEYS)
            ik = pick(reader.fieldnames or [], IPS_KEYS)
            if not ck or not ik:
                sys.stderr.write(f'  ! {path}: could not find code/ips columns in {reader.fieldnames}\n')
                continue
            for row in reader:
                code = (row.get(ck) or '').strip()
                v = (row.get(ik) or '').strip().replace(',', '.')
                if not code:
                    continue
                try:
                    val = float(v)
                except ValueError:
                    continue
                s = agg.setdefault(code, [0.0, 0])
                s[0] += val; s[1] += 1

    n = 0
    with open(a.out, 'w', encoding='utf-8', newline='') as fo:
        w = csv.writer(fo)
        w.writerow(['code_commune', 'ips_mean'])
        for code, (tot, cnt) in agg.items():
            if cnt:
                w.writerow([code, round(tot / cnt, 1)])
                n += 1
    sys.stderr.write(f'  {n} communes with mean IPS -> {a.out}\n')


if __name__ == '__main__':
    main()
