#!/usr/bin/env python3
"""Parse raw DGFiP DVF files (valeursfoncieres-YYYY.txt) and prepare them for loading.

Two modes:
  parse  --dept 13 --year 2018 --infile X.txt --clean clean.csv --addr addr.csv
         Reads the pipe-separated national file, keeps real sales ('Vente') for the
         department, writes a clean CSV (one row per DVF line) plus a deduplicated
         address CSV for geocoding.
  slim   --geocoded geo.csv --out geoslim.csv
         Reduces the BAN geocoder output to addr_key,lat,lon,score (coords kept only
         when result_score >= 0.4).

No third-party dependencies — standard library only.
"""
import argparse
import csv
import hashlib
import sys
from datetime import datetime

csv.field_size_limit(10_000_000)


def addr_key(numero: str, voie: str, cp: str, commune: str) -> str:
    return hashlib.md5(f"{numero}|{voie}|{cp}|{commune}".encode("utf-8")).hexdigest()[:16]


def num(s: str) -> str:
    """French number ('120000,50' / '1 200') -> '120000.50'. Empty stays empty."""
    s = (s or "").strip().replace(" ", "").replace(",", ".")
    return s


def to_iso(d: str) -> str:
    d = (d or "").strip()
    try:
        return datetime.strptime(d, "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return ""


def norm_type(t: str, surface_terrain: str) -> str:
    t = (t or "").strip()
    if t.startswith("Maison"):
        return "Maison"
    if t.startswith("Appartement"):
        return "Appartement"
    if "commercial" in t or "industriel" in t:
        return "Local"
    if t.startswith("Dépendance") or t.startswith("Dependance"):
        return "Dépendance"
    if not t and surface_terrain:
        return "Terrain"
    return t


def parse(a: argparse.Namespace) -> None:
    seen: set[str] = set()
    kept = 0
    with open(a.infile, encoding="utf-8", errors="replace", newline="") as f, \
         open(a.clean, "w", encoding="utf-8", newline="") as fc, \
         open(a.addr, "w", encoding="utf-8", newline="") as fa:
        reader = csv.DictReader(f, delimiter="|")
        wc = csv.writer(fc)
        wa = csv.writer(fa)
        wc.writerow([
            "id_synth", "date_mutation", "nature", "valeur", "addr_key", "adresse",
            "code_postal", "code_commune", "nom_commune", "code_departement",
            "id_parcelle", "type_local", "surface_bati", "nb_pieces", "surface_terrain",
        ])
        wa.writerow(["addr_key", "numero", "voie", "code_postal", "citycode"])
        for row in reader:
            cd = (row.get("Code departement") or "").strip()
            if a.dept != "all" and cd != a.dept:
                continue
            if (row.get("Nature mutation") or "").strip() != "Vente":
                continue
            valeur = num(row.get("Valeur fonciere"))
            if not valeur:
                continue
            kept += 1

            numero = (row.get("No voie") or "").strip()
            voie = f"{(row.get('Type de voie') or '').strip()} {(row.get('Voie') or '').strip()}".strip()
            cp = (row.get("Code postal") or "").strip()
            commune = (row.get("Commune") or "").strip()
            ccom = (row.get("Code commune") or "").strip()
            insee = f"{cd}{ccom.zfill(3)}" if cd and ccom else ""

            sect = (row.get("Section") or "").strip()
            plan = (row.get("No plan") or "").strip()
            pref = (row.get("Prefixe de section") or "").strip()
            parcelle = f"{insee}{(pref or '000').zfill(3)}{sect}{plan.zfill(4)}" if insee and sect else ""

            st = num(row.get("Surface terrain"))
            tl = norm_type(row.get("Type local"), st)
            adresse = " ".join(x for x in [numero, voie] if x).strip()
            k = addr_key(numero, voie, cp, commune)

            wc.writerow([
                f"{a.year}-{cd}-{kept}", to_iso(row.get("Date mutation")), "Vente", valeur,
                k, adresse, cp, insee, commune, cd, parcelle, tl,
                num(row.get("Surface reelle bati")),
                (row.get("Nombre pieces principales") or "").strip(), st,
            ])
            if k not in seen:
                seen.add(k)
                wa.writerow([k, numero, voie, cp, insee])

    sys.stderr.write(f"  parsed {kept} sales, {len(seen)} unique addresses\n")


def slim(a: argparse.Namespace) -> None:
    with open(a.geocoded, encoding="utf-8", errors="replace", newline="") as f, \
         open(a.out, "w", encoding="utf-8", newline="") as o:
        reader = csv.DictReader(f)
        w = csv.writer(o)
        w.writerow(["addr_key", "lat", "lon", "score"])
        for row in reader:
            lat, lon = row.get("latitude") or "", row.get("longitude") or ""
            sc = row.get("result_score") or ""
            ok = False
            try:
                ok = bool(sc) and float(sc) >= 0.4 and lat and lon
            except ValueError:
                ok = False
            w.writerow([row.get("addr_key"), lat if ok else "", lon if ok else "", sc])


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="mode", required=True)

    pp = sub.add_parser("parse")
    pp.add_argument("--dept", required=True)
    pp.add_argument("--year", required=True)
    pp.add_argument("--infile", required=True)
    pp.add_argument("--clean", required=True)
    pp.add_argument("--addr", required=True)
    pp.set_defaults(func=parse)

    ps = sub.add_parser("slim")
    ps.add_argument("--geocoded", required=True)
    ps.add_argument("--out", required=True)
    ps.set_defaults(func=slim)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
