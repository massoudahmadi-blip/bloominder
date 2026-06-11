#!/usr/bin/env python3
"""Compute % FttH-connectable premises per commune from the ARCEP commune
shapefile zip (reads only the .dbf attribute table — no geometry). Stdlib only.

Usage:  fetch_fiber.py --zip 2025t4-commune.zip --out fiber.csv
"""
import argparse
import csv
import struct
import sys
import zipfile


def read_dbf(raw: bytes):
    n_records = struct.unpack('<I', raw[4:8])[0]
    header_len = struct.unpack('<H', raw[8:10])[0]
    record_len = struct.unpack('<H', raw[10:12])[0]
    fields = []
    pos, offset = 32, 1  # record byte 0 is the deletion flag
    while raw[pos] != 0x0D:
        fd = raw[pos:pos + 32]
        name = fd[0:11].split(b'\x00')[0].decode('latin-1').strip()
        flen = fd[16]
        fields.append((name, offset, flen))
        offset += flen
        pos += 32
    for i in range(n_records):
        rec = raw[header_len + i * record_len: header_len + (i + 1) * record_len]
        if len(rec) < record_len:
            break
        yield {name: rec[off:off + ln].decode('latin-1').strip() for (name, off, ln) in fields}


def pick(fieldnames, opts):
    low = {f.lower(): f for f in fieldnames}
    for o in opts:
        if o in low:
            return low[o]
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--zip", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()

    z = zipfile.ZipFile(a.zip)
    dbf = next((n for n in z.namelist() if n.lower().endswith('.dbf')), None)
    if not dbf:
        sys.stderr.write("  no .dbf in zip\n"); sys.exit(1)
    rows = list(read_dbf(z.read(dbf)))
    if not rows:
        sys.stderr.write("  no records\n"); sys.exit(1)

    flds = list(rows[0].keys())
    codecol = pick(flds, ['insee_com', 'code_insee', 'codgeo', 'depcom'])
    totcol = pick(flds, ['locaux', 'nb_locaux', 'loc'])
    ftthcol = pick(flds, ['ftth', 'loc_ftth', 'locaux_ftth', 'nb_ftth'])
    if not (codecol and totcol and ftthcol):
        sys.stderr.write(f"  could not detect columns; fields: {flds}\n"); sys.exit(1)

    agg: dict[str, list] = {}
    for r in rows:
        code = (r.get(codecol) or '').strip()
        if not code:
            continue
        try:
            tot = float((r.get(totcol) or '0').replace(',', '.'))
            ftth = float((r.get(ftthcol) or '0').replace(',', '.'))
        except ValueError:
            continue
        a2 = agg.setdefault(code, [0.0, 0.0])
        a2[0] += tot
        a2[1] += ftth

    n = 0
    with open(a.out, "w", encoding="utf-8", newline="") as o:
        w = csv.writer(o)
        w.writerow(["code_commune", "fiber_pct"])
        for code, (tot, ftth) in agg.items():
            pct = round(ftth / tot * 100, 1) if tot > 0 else ''
            w.writerow([code, pct])
            n += 1
    sys.stderr.write(f"  {n} communes (fiber coverage)\n")


if __name__ == "__main__":
    main()
