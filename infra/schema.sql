-- Bloominder database schema (runs automatically on first DB startup).
-- Two tables:
--   dvf_raw      = staging, everything as TEXT (robust against messy CSV values)
--   transactions = clean, typed, geolocated sales used by the app
-- Indexes are created *after* loading (see load_dvf.sh) for speed.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Staging table: column order MUST match the geo-dvf CSV header exactly.
-- (40 columns, from files.data.gouv.fr/geo-dvf/latest/csv/.../departements/XX.csv)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS dvf_raw;
CREATE TABLE dvf_raw (
  id_mutation                   TEXT,
  date_mutation                 TEXT,
  numero_disposition            TEXT,
  nature_mutation               TEXT,
  valeur_fonciere               TEXT,
  adresse_numero                TEXT,
  adresse_suffixe               TEXT,
  adresse_nom_voie              TEXT,
  adresse_code_voie             TEXT,
  code_postal                   TEXT,
  code_commune                  TEXT,
  nom_commune                   TEXT,
  code_departement              TEXT,
  ancien_code_commune           TEXT,
  ancien_nom_commune            TEXT,
  id_parcelle                   TEXT,
  ancien_id_parcelle            TEXT,
  numero_volume                 TEXT,
  lot1_numero                   TEXT,
  lot1_surface_carrez           TEXT,
  lot2_numero                   TEXT,
  lot2_surface_carrez           TEXT,
  lot3_numero                   TEXT,
  lot3_surface_carrez           TEXT,
  lot4_numero                   TEXT,
  lot4_surface_carrez           TEXT,
  lot5_numero                   TEXT,
  lot5_surface_carrez           TEXT,
  nombre_lots                   TEXT,
  code_type_local               TEXT,
  type_local                    TEXT,
  surface_reelle_bati           TEXT,
  nombre_pieces_principales     TEXT,
  code_nature_culture           TEXT,
  nature_culture                TEXT,
  code_nature_culture_speciale  TEXT,
  nature_culture_speciale       TEXT,
  surface_terrain               TEXT,
  longitude                     TEXT,
  latitude                      TEXT
);

-- ---------------------------------------------------------------------------
-- Clean table the application reads from.
-- One row per (mutation, line) for now; aggregation per mutation happens in
-- queries. geom is WGS84 (EPSG:4326) for map/bbox/radius searches.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS transactions;
CREATE TABLE transactions (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_mutation       text        NOT NULL,
  date_mutation     date        NOT NULL,
  nature_mutation   text,
  valeur_fonciere   numeric,
  adresse           text,                 -- "12 RUE DES LILAS"
  code_postal       text,
  code_commune      text,
  nom_commune       text,
  code_departement  text,
  id_parcelle       text,
  type_local        text,                 -- Maison / Appartement / NULL (terrain/local)
  surface_bati      numeric,
  nb_pieces         integer,
  surface_terrain   numeric,
  prix_m2           numeric,              -- valeur_fonciere / surface_bati (when sensible)
  longitude         double precision,
  latitude          double precision,
  geom              geometry(Point, 4326),
  geo_precision     text                  -- how geom was placed: source|parcel|address|commune
);
