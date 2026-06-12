#!/usr/bin/env python3
"""
Fetch the Paris "encadrement des loyers" reference rents (per quartier) from the
opendata.paris.fr Explore API and emit idempotent SQL for rent_control_zone +
rent_control_ref. Stdlib only (urllib).

Usage:
  python3 fetch_rent_control.py --out /data/rent_control_paris.sql
  # other cities publish their own datasets with the same idea but different
  # field names — add an adapter and pass --dataset/--base/--city accordingly.
"""
import argparse
import json
import sys
import urllib.request

def fetch_all(base: str, dataset: str):
    # The paginated /records endpoint caps offset+limit at 10000, but this
    # dataset is larger — use /exports/json, which streams every record (all
    # fields incl. geo_shape) with no pagination cap. A real User-Agent avoids
    # the WAF rejecting "Python-urllib".
    url = f"{base}/api/explore/v2.1/catalog/datasets/{dataset}/exports/json"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Bloominder data loader; +https://bloominder.com)",
        "Accept": "application/json",
        "Accept-Encoding": "identity",
    })
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"\nHTTP {e.code} on {url}\n{e.read().decode('utf-8', 'replace')[:500]}\n")
        raise
    rows = data if isinstance(data, list) else data.get("results", [])
    sys.stderr.write(f"  fetched {len(rows)} records\n")
    return rows


def geom_of(rec):
    g = rec.get("geo_shape")
    if not g:
        return None
    if isinstance(g, dict) and g.get("type") == "Feature":
        g = g.get("geometry")
    return g if g and g.get("coordinates") else None


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--base", default="https://opendata.paris.fr")
    ap.add_argument("--dataset", default="logement-encadrement-des-loyers")
    ap.add_argument("--city", default="PARIS")
    a = ap.parse_args()

    rows = fetch_all(a.base, a.dataset)

    # The dataset spans several years — keep only the most recent.
    years = [int(r["annee"]) for r in rows if str(r.get("annee", "")).isdigit()]
    latest = max(years) if years else 0
    rows = [r for r in rows if str(r.get("annee")) == str(latest)]
    sys.stderr.write(f"  keeping {len(rows)} rows for year {latest}\n")

    # Geometry granularity is the quartier; rents are keyed by the secteur
    # (id_zone). Store every quartier polygon with a pointer to its secteur.
    quartiers = {}  # id_quartier -> (name, zone_ref, geojson)
    for rec in rows:
        qid = rec.get("id_quartier")
        zid = rec.get("id_zone")
        if qid is None or zid is None:
            continue
        if qid not in quartiers:
            g = geom_of(rec)
            if g:
                quartiers[qid] = (rec.get("nom_quartier") or "", f"{a.city}-{zid}", json.dumps(g))

    with open(a.out, "w", encoding="utf-8") as f:
        f.write(f"DELETE FROM rent_control_ref WHERE city = {sql_str(a.city)};\n")
        f.write(f"DELETE FROM rent_control_zone WHERE city = {sql_str(a.city)};\n")
        for qid, (name, zone_ref, gj) in quartiers.items():
            f.write(
                f"INSERT INTO rent_control_zone(id,city,name,zone_ref,geom) VALUES "
                f"({sql_str(f'{a.city}-q{qid}')},{sql_str(a.city)},{sql_str(name)},{sql_str(zone_ref)},"
                f"ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON({sql_str(gj)})),4326)) "
                f"ON CONFLICT (id) DO UPDATE SET geom=EXCLUDED.geom, name=EXCLUDED.name, zone_ref=EXCLUDED.zone_ref;\n")
        n = 0
        seen = set()  # (id_zone, rooms, epoch, furnished) — rents repeat per quartier
        for rec in rows:
            zid = rec.get("id_zone")
            if zid is None or rec.get("ref") is None:
                continue
            try:
                rooms = min(4, int(rec.get("piece") or 0))
            except (TypeError, ValueError):
                continue
            furnished = "non" not in str(rec.get("meuble_txt", "")).lower()
            epoch = rec.get("epoque") or ""
            key = (zid, rooms, epoch, furnished)
            if key in seen:
                continue
            seen.add(key)
            f.write(
                "INSERT INTO rent_control_ref(zone_ref,city,rooms,epoch,furnished,"
                "ref_eur_m2,ref_majored_eur_m2,ref_minored_eur_m2,year) VALUES "
                f"({sql_str(f'{a.city}-{zid}')},{sql_str(a.city)},{rooms},{sql_str(epoch)},"
                f"{'true' if furnished else 'false'},{rec.get('ref')},{rec.get('max')},"
                f"{rec.get('min')},{int(rec.get('annee') or 0)});\n")
            n += 1
    sys.stderr.write(f"  wrote {len(quartiers)} quartiers, {n} reference rows to {a.out}\n")


if __name__ == "__main__":
    main()
