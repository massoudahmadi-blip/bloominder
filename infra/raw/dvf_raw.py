#!/usr/bin/env python3
"""Parse raw DGFiP DVF files (valeursfoncieres-YYYY.txt) and prepare them for loading.

Modes:
  parse  --dept 13 --year 2018 --infile X.txt --clean clean.csv --addr addr.csv
         One department: clean CSV (one row per DVF line) + deduped address CSV.
  split  --year 2018 --infile X.txt --outdir DIR
         All departments in ONE pass: writes DIR/clean_<dept>.csv + DIR/addr_<dept>.csv.
         (Used by the national load so each ~300 MB file is read only once.)
  slim   --geocoded geo.csv --out geoslim.csv
         Reduces BAN geocoder output to addr_key,lat,lon,score (coords kept if score >= 0.4).

Standard library only.
"""
import argparse
import csv
import hashlib
import os
import sys
from datetime import datetime

csv.field_size_limit(10_000_000)

CLEAN_HEADER = [
    "id_synth", "date_mutation", "nature", "valeur", "addr_key", "adresse",
    "code_postal", "code_commune", "nom_commune", "code_departement",
    "id_parcelle", "type_local", "surface_bati", "nb_pieces", "surface_terrain",
    "prefixe_section", "section", "no_plan", "no_volume", "nombre_lots", "surface_carrez",
]
ADDR_HEADER = ["addr_key", "numero", "voie", "code_postal", "citycode"]


def addr_key(numero: str, voie: str, cp: str, commune: str) -> str:
    return hashlib.md5(f"{numero}|{voie}|{cp}|{commune}".encode("utf-8")).hexdigest()[:16]


def num(s: str) -> str:
    return (s or "").strip().replace(" ", "").replace(",", ".")


def to_iso(d: str) -> str:
    try:
        return datetime.strptime((d or "").strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return ""


# DGFiP abbreviates the street type ("Type de voie"). Expand the common ones so
# the stored address reads "5 bis Passage Piver" (matches BAN + free-text search)
# rather than "5 PASS PIVER".
VOIE_TYPES = {
    "ALL": "Allée", "AV": "Avenue", "BD": "Boulevard", "CAR": "Carrefour",
    "CHE": "Chemin", "CHS": "Chaussée", "CITE": "Cité", "COR": "Corniche",
    "CRS": "Cours", "DOM": "Domaine", "DSC": "Descente", "ESP": "Esplanade",
    "FG": "Faubourg", "GR": "Grande Rue", "HAM": "Hameau", "HLE": "Halle",
    "IMP": "Impasse", "LD": "Lieu-dit", "LOT": "Lotissement", "MAR": "Marché",
    "MTE": "Montée", "PAS": "Passage", "PASS": "Passage", "PL": "Place",
    "PLN": "Plaine", "PLT": "Plateau", "PRO": "Promenade", "PRV": "Parvis",
    "QUA": "Quartier", "QU": "Quai", "RES": "Résidence", "RPT": "Rond-Point",
    "RTE": "Route", "RUE": "Rue", "SEN": "Sentier", "SQ": "Square",
    "TRA": "Traverse", "VLA": "Villa", "VLGE": "Village", "VOIE": "Voie",
}
# Repetition index ("B/T/Q"): B=bis, T=ter, Q=quater (others kept as-is, lower-cased).
BTQ = {"B": "bis", "T": "ter", "Q": "quater"}


def expand_voie(t: str) -> str:
    t = (t or "").strip()
    return VOIE_TYPES.get(t.upper(), t)


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


def build(row: dict):
    """Return (dept, clean_row[without id], addr_row) for a kept sale, or None to skip."""
    cd = (row.get("Code departement") or "").strip()
    if not cd:
        return None
    if (row.get("Nature mutation") or "").strip() != "Vente":
        return None
    valeur = num(row.get("Valeur fonciere"))
    if not valeur:
        return None

    no_voie = (row.get("No voie") or "").strip()
    btq = (row.get("B/T/Q") or "").strip()
    rep = BTQ.get(btq.upper(), btq.lower()) if btq else ""
    numero = f"{no_voie} {rep}".strip() if rep else no_voie
    voie = f"{expand_voie(row.get('Type de voie'))} {(row.get('Voie') or '').strip()}".strip()
    cp = (row.get("Code postal") or "").strip()
    commune = (row.get("Commune") or "").strip()
    ccom = (row.get("Code commune") or "").strip()
    insee = f"{cd}{ccom.zfill(3)}" if cd and ccom else ""
    sect = (row.get("Section") or "").strip()
    plan = (row.get("No plan") or "").strip()
    pref = (row.get("Prefixe de section") or "").strip()
    vol = (row.get("No Volume") or "").strip()
    parcelle = f"{insee}{(pref or '000').zfill(3)}{sect}{plan.zfill(4)}" if insee and sect else ""
    st = num(row.get("Surface terrain"))
    tl = norm_type(row.get("Type local"), st)
    adresse = " ".join(x for x in [numero, voie] if x).strip()
    k = addr_key(numero, voie, cp, commune)

    # Condo lots: sum the Carrez (legal) surfaces; count the lots.
    carrez = 0.0
    for i in range(1, 6):
        v = num(row.get(f"Surface Carrez du {i}er lot" if i == 1 else f"Surface Carrez du {i}eme lot"))
        try:
            carrez += float(v)
        except ValueError:
            pass
    nb_lots = (row.get("Nombre de lots") or "").strip()

    clean = [
        to_iso(row.get("Date mutation")), "Vente", valeur, k, adresse, cp, insee,
        commune, cd, parcelle, tl, num(row.get("Surface reelle bati")),
        (row.get("Nombre pieces principales") or "").strip(), st,
        pref, sect, plan, vol, nb_lots, (f"{carrez:.2f}" if carrez > 0 else ""),
    ]
    addr = [k, numero, voie, cp, insee]
    return cd, clean, addr


def parse(a: argparse.Namespace) -> None:
    seen: set[str] = set()
    kept = 0
    with open(a.infile, encoding="utf-8", errors="replace", newline="") as f, \
         open(a.clean, "w", encoding="utf-8", newline="") as fc, \
         open(a.addr, "w", encoding="utf-8", newline="") as fa:
        reader = csv.DictReader(f, delimiter="|")
        wc, wa = csv.writer(fc), csv.writer(fa)
        wc.writerow(CLEAN_HEADER)
        wa.writerow(ADDR_HEADER)
        for row in reader:
            if a.dept != "all" and (row.get("Code departement") or "").strip() != a.dept:
                continue
            built = build(row)
            if not built:
                continue
            _, clean, addr = built
            kept += 1
            wc.writerow([f"{a.year}-{clean[8]}-{kept}", *clean])
            if addr[0] not in seen:
                seen.add(addr[0])
                wa.writerow(addr)
    sys.stderr.write(f"  parsed {kept} sales, {len(seen)} unique addresses\n")


def split(a: argparse.Namespace) -> None:
    os.makedirs(a.outdir, exist_ok=True)
    writers: dict[str, list] = {}  # dept -> [wc, wa, fc, fa, seen, counter]

    def w_for(dept: str):
        if dept not in writers:
            fc = open(os.path.join(a.outdir, f"clean_{dept}.csv"), "w", encoding="utf-8", newline="")
            fa = open(os.path.join(a.outdir, f"addr_{dept}.csv"), "w", encoding="utf-8", newline="")
            wc, wa = csv.writer(fc), csv.writer(fa)
            wc.writerow(CLEAN_HEADER)
            wa.writerow(ADDR_HEADER)
            writers[dept] = [wc, wa, fc, fa, set(), 0]
        return writers[dept]

    with open(a.infile, encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f, delimiter="|")
        for row in reader:
            built = build(row)
            if not built:
                continue
            dept, clean, addr = built
            w = w_for(dept)
            w[5] += 1
            w[0].writerow([f"{a.year}-{dept}-{w[5]}", *clean])
            if addr[0] not in w[4]:
                w[4].add(addr[0])
                w[1].writerow(addr)

    for w in writers.values():
        w[2].close()
        w[3].close()
    sys.stderr.write(f"  split {a.year} into {len(writers)} departments\n")


def slim(a: argparse.Namespace) -> None:
    # --with-type appends a precision column from BAN's result_type: an exact
    # housenumber/street is 'address'; a locality/municipality (rural lieu-dit
    # with no street number) is only 'locality' — a hamlet/town centroid, not a
    # precise point — so it can be ranked below a cadastral-parcel placement.
    PREC = {"housenumber": "address", "street": "address"}
    with open(a.geocoded, encoding="utf-8", errors="replace", newline="") as f, \
         open(a.out, "w", encoding="utf-8", newline="") as o:
        reader = csv.DictReader(f)
        w = csv.writer(o)
        w.writerow(["addr_key", "lat", "lon", "score"] + (["prec"] if a.with_type else []))
        for row in reader:
            lat, lon, sc = row.get("latitude") or "", row.get("longitude") or "", row.get("result_score") or ""
            try:
                ok = bool(sc) and float(sc) >= 0.4 and lat and lon
            except ValueError:
                ok = False
            extra = [PREC.get((row.get("result_type") or "").strip(), "locality")] if a.with_type else []
            w.writerow([row.get("addr_key"), lat if ok else "", lon if ok else "", sc] + extra)


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

    sp = sub.add_parser("split")
    sp.add_argument("--year", required=True)
    sp.add_argument("--infile", required=True)
    sp.add_argument("--outdir", required=True)
    sp.set_defaults(func=split)

    ps = sub.add_parser("slim")
    ps.add_argument("--geocoded", required=True)
    ps.add_argument("--out", required=True)
    ps.add_argument("--with-type", action="store_true", dest="with_type")
    ps.set_defaults(func=slim, with_type=False)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
