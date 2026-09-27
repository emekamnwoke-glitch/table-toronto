# Table Toronto (working name)

A solo reimplementation of the *Tablé* concept — a two-sided dining
marketplace matching diners with immediate table availability, and
restaurants with a way to fill quiet periods — rescoped from Manhattan to
Toronto, Ontario, on an entirely open-source stack.

Inspired by [comp47360-team2](https://github.com/chukwuemekanwoke-jpg/comp47360-team2),
a team academic project. This is a fresh, independently written codebase;
it reuses the architectural approach, not the original team's code.

**Start here:** [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md)
records every scope and stack decision made so far, with the reasoning
and trade-offs behind each one. Read that before making a change that
might contradict an earlier decision.

## What's different from the original

- **City:** full amalgamated City of Toronto, not Manhattan.
- **Data:** Toronto Open Data (business licences, Bike Share ridership) +
  StatCan geography, replacing NYC TLC taxi records and PLUTO land-use
  data. The mobility-proxy substitute (bike-share trips instead of taxi
  drop-offs) is a genuine open research question, not a like-for-like
  swap — see DECISIONS.md for why.
- **Infrastructure:** open-source and self-hosted end to end — Postgres/PostGIS,
  MapLibre + OpenFreeMap, Valhalla routing, Nominatim geocoding, Dokku/CapRover
  hosting — instead of the original's GCP-managed services.

## Repository layout

```text
table-toronto/
├── docs/architecture/DECISIONS.md  # read this first
├── frontend/
│   ├── web-app/          # React + Vite, MapLibre GL JS
│   ├── mobile-app/       # Expo + React Native, MapLibre native
│   └── packages/shared/  # Shared API client + types
├── backend/
│   └── api-gateway/      # Node.js/Express transactional API
├── ml-pipeline/
│   ├── data/raw/         # Downloaded source data (gitignored — see scripts/)
│   ├── data/processed/   # Cleaned/joined data used for training
│   ├── notebooks/        # Exploration and feature engineering
│   └── fastapi-app/      # Busyness prediction + matching inference service
├── database/
│   ├── migrations/
│   └── seeds/
├── infra/
│   ├── valhalla/         # Self-hosted routing engine config
│   └── caddy/            # Reverse proxy / static hosting config
└── scripts/              # Data-fetch and setup scripts
```

## Status

Data feasibility (restaurant listings, mobility proxy, geocoding) has
been validated against real Toronto Open Data — see DECISIONS.md for the
numbers. The database schema is migrated and seeded (158 neighbourhoods,
real PostGIS geometry), and a minimal API gateway serves it. Not started
yet: the frontend clients, the busyness model, and most of the booking/
campaign logic — see `backend/api-gateway/src/services/` for the module
boundaries already reserved for that work.

## Setup

```bash
cp .env.example .env                       # defaults work for local dev
docker compose up -d postgres
npm run migrate --prefix database
npm run seed:neighbourhoods --prefix database
npm install --prefix backend/api-gateway
npm start --prefix backend/api-gateway     # http://localhost:3001
```

`scripts/fetch-data.sh` reproduces the raw Toronto Open Data pull used
during scoping, and `ml-pipeline/scripts/geocode_restaurants.py` +
`build_restaurant_features.py` build the restaurant-side data described
in DECISIONS.md.
