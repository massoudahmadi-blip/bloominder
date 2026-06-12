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
    # No `select`: "max"/"min" are reserved keywords in the API query language
    # and 400 if used as field names. The default response returns all fields
    # (incl. geo_shape) anyway. A real User-Agent avoids the WAF rejecting
    # "Python-urllib" with a 400/403.
    rows = []
    offset = 0
    while True:
        url = (f"{base}/api/explore/v2.1/catalog/datasets/{dataset}/records"
               f"?limit=100&offset={offset}")
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Bloominder data loader; +https://bloominder.com)",
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            sys.stderr.write(f"\nHTTP {e.code} on {url}\n{e.read().decode('utf-8', 'replace')[:500]}\n")
            raise
        results = data.get("results", [])
        rows.extend(results)
        total = data.get("total_count", len(rows))
        offset += 100
        sys.stderr.write(f"  fetched {len(rows)}/{total}\r")
        if offset >= total or not results:
            break
    sys.stderr.write("\n")
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
    zones = {}   # id_zone -> (name, geojson)
    for rec in rows:
        zid = rec.get("id_zone")
        if zid is None:
            continue
        if zid not in zones:
            g = geom_of(rec)
            if g:
                zones[zid] = (rec.get("nom_quartier") or "", json.dumps(g))

    with open(a.out, "w", encoding="utf-8") as f:
        f.write(f"DELETE FROM rent_control_ref WHERE city = {sql_str(a.city)};\n")
        f.write(f"DELETE FROM rent_control_zone WHERE city = {sql_str(a.city)};\n")
        for zid, (name, gj) in zones.items():
            zone_id = f"{a.city}-{zid}"
            f.write(
                f"INSERT INTO rent_control_zone(id,city,name,geom) VALUES "
                f"({sql_str(zone_id)},{sql_str(a.city)},{sql_str(name)},"
                f"ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON({sql_str(gj)})),4326)) "
                f"ON CONFLICT (id) DO UPDATE SET geom=EXCLUDED.geom, name=EXCLUDED.name;\n")
        n = 0
        for rec in rows:
            zid = rec.get("id_zone")
            if zid is None or rec.get("ref") is None:
                continue
            zone_id = f"{a.city}-{zid}"
            try:
                rooms = min(4, int(rec.get("piece") or 0))
            except (TypeError, ValueError):
                continue
            furnished = "non" not in str(rec.get("meuble_txt", "")).lower()
            epoch = rec.get("epoque") or ""
            f.write(
                "INSERT INTO rent_control_ref(zone_id,city,rooms,epoch,furnished,"
                "ref_eur_m2,ref_majored_eur_m2,ref_minored_eur_m2,year) VALUES "
                f"({sql_str(zone_id)},{sql_str(a.city)},{rooms},{sql_str(epoch)},"
                f"{'true' if furnished else 'false'},{rec.get('ref')},{rec.get('max')},"
                f"{rec.get('min')},{int(rec.get('annee') or 0)});\n")
            n += 1
    sys.stderr.write(f"  wrote {len(zones)} zones, {n} reference rows to {a.out}\n")


if __name__ == "__main__":
    main()
