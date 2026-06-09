# Bloominder — VPS setup & DVF pilot load

Goal of this guide: take a fresh **IONOS VPS Linux L+**, secure it, run a
**PostgreSQL + PostGIS** database in Docker, and load **one department** of French
sold-price data (DVF géolocalisé) so we can prototype the map.

Files referenced live in `infra/`:
`docker-compose.yml`, `.env.example`, `schema.sql`, `load_dvf.sh`.

---

## 0. Before you start
- You have ordered the IONOS VPS Linux L+. In the IONOS Cloud Panel you'll get the
  server's **public IP** and a **root password** (or you set an SSH key).
- Pick a **Linux distro** when creating the VPS: choose **Ubuntu 24.04 LTS** (commands below assume it).
- Point DNS later: in your domain settings for **bloominder.com**, you'll add an `A` record → the VPS IP.
  (Not needed yet for the database pilot.)

---

## 1. Connect to the VPS (from your Windows PC)
Open **PowerShell** and SSH in (Windows has `ssh` built in):

```powershell
ssh root@YOUR_SERVER_IP
```

Accept the fingerprint and enter the password. You're now on the Linux server.

---

## 2. Basic hardening (do this once)
Create a non-root user, enable a firewall, and turn on automatic security updates.

```bash
# --- create a working user with sudo ---
adduser bloom                 # set a password when prompted
usermod -aG sudo bloom

# --- firewall: allow SSH + web only ---
apt update && apt -y install ufw fail2ban
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- automatic security patches ---
apt -y install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades   # choose "Yes"
```

> Tip: set up SSH-key login for the `bloom` user and disable password/root SSH later.
> Not required for this pilot, but recommended before going public.

From now on, work as the `bloom` user:
```bash
su - bloom
```

---

## 3. Install Docker
```bash
sudo apt -y install ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in so the group applies:
exit          # back to root, then:
su - bloom
docker run --rm hello-world   # should print "Hello from Docker!"
```

---

## 4. Put the infra files on the server
Two options:

**A. Quickest — create the folder and paste files** (use `nano`):
```bash
mkdir -p ~/bloominder/infra && cd ~/bloominder/infra
nano docker-compose.yml      # paste contents, Ctrl+O, Enter, Ctrl+X
nano schema.sql              # same
nano load_dvf.sh             # same
nano .env.example            # same
```

**B. Better long-term — keep them in a git repo** and `git clone` onto the server.
(We can set this up next.)

Then create your real env file and make the loader executable:
```bash
cp .env.example .env
nano .env                    # set a long random POSTGRES_PASSWORD
chmod +x load_dvf.sh
```

---

## 5. Start the database
```bash
cd ~/bloominder/infra
docker compose up -d
docker compose logs -f db    # wait until you see "database system is ready", Ctrl+C
```
On first start, `schema.sql` runs automatically and creates the `dvf_raw` and
`transactions` tables plus the PostGIS extension.

---

## 6. Load a pilot department
We'll start with **department 13 (Bouches-du-Rhône)** — PACA, near Mas des Figues —
for the years 2019–2024:

```bash
./load_dvf.sh 13 2019 2024
```
The script downloads each year's geolocated CSV, loads it into staging, transforms it
into the clean `transactions` table, builds the spatial indexes, and prints the row count.

> Use any department code (e.g. `75` Paris, `06` Alpes-Maritimes, `33` Gironde).
> Codes `67`, `68`, `57` (Alsace/Moselle) and `976` (Mayotte) have **no DVF data** — expected.

---

## 7. Verify it worked
Open a database shell:
```bash
docker compose exec db psql -U bloominder -d bloominder
```
Then try these (the kind of queries the app will run):

```sql
-- How many sales did we load?
SELECT count(*) FROM transactions;

-- Median price per m² for houses, by commune (top 10 by volume)
SELECT nom_commune,
       count(*)                              AS ventes,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2)) AS median_eur_m2
FROM transactions
WHERE type_local = 'Maison' AND prix_m2 IS NOT NULL
GROUP BY nom_commune
ORDER BY ventes DESC
LIMIT 10;

-- MAP QUERY: all sales inside a bounding box (lon/lat) — this powers the map.
-- Example box around Arles:
SELECT id_mutation, date_mutation, valeur_fonciere, type_local, prix_m2, longitude, latitude
FROM transactions
WHERE geom && ST_MakeEnvelope(4.55, 43.63, 4.70, 43.71, 4326)
ORDER BY date_mutation DESC
LIMIT 500;

-- RADIUS QUERY: sales within 500 m of a point (address detail page comps).
SELECT id_mutation, date_mutation, valeur_fonciere, prix_m2,
       round(ST_Distance(geom::geography,
             ST_SetSRID(ST_MakePoint(4.6277, 43.6766),4326)::geography)) AS metres
FROM transactions
WHERE ST_DWithin(geom::geography,
                 ST_SetSRID(ST_MakePoint(4.6277, 43.6766),4326)::geography, 500)
ORDER BY metres
LIMIT 50;
```
Type `\q` to exit psql.

If those return rows, **the data backbone is working.** 🎉

---

## 8. What's next (after the pilot loads)
1. **Backups:** schedule `pg_dump` to a second IONOS volume / object storage.
2. **API layer:** a small Node/TypeScript service exposing `/search`, `/map`, `/property`
   endpoints over these exact queries (API-first, so the future mobile app reuses it).
3. **Frontend:** Next.js + MapLibre map calling the API; address autocomplete via the BAN API.
4. **Scale-out:** once the pilot looks right, run `load_dvf.sh` for all mainland departments.

---

## Troubleshooting
- **`docker compose` not found** → log out/in after step 3 (group membership), or use `sudo docker compose`.
- **`\copy` column-count error** → the CSV header changed; the `dvf_raw` columns in `schema.sql`
  must match the geo-dvf header order exactly.
- **Download 404 for a year** → that year may not exist yet for the department; the script skips it.
- **Out of memory during index build** → lower `maintenance_work_mem` in `docker-compose.yml`.
