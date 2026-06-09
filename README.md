# Bloominder

Look up what any French property sold for, see sales on a map, and get an estimate of
what a home is worth today — built on French government open data (DVF), hosted on IONOS.
A "HAR.com for France." Domain: **bloominder.com**.

## Repository layout
```
.
├── REQUIREMENTS.md     Product requirements & roadmap
├── SETUP.md            How to stand up the VPS + database
├── infra/              Docker, DB schema, DVF data loader
│   ├── docker-compose.yml
│   ├── schema.sql
│   ├── load_dvf.sh
│   └── .env.example
└── api/                Backend JSON API (Fastify + TypeScript + PostGIS)
    ├── src/
    └── package.json
```

## Quick start
1. **Database** — follow [SETUP.md](SETUP.md): boot the IONOS VPS, run the DB in Docker,
   and load a pilot department with `infra/load_dvf.sh`.
2. **API** — see [api/README.md](api/README.md): `npm install`, set `api/.env`, `npm run dev`.
3. **Frontend** *(next phase)* — Next.js + MapLibre, calling the API.

## Status
Phase 1 (MVP): data backbone ✅ · API skeleton ✅ · map frontend ⏳

See [REQUIREMENTS.md](REQUIREMENTS.md) for the full plan.
