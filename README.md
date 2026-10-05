# Table Toronto (working name)

Helps someone choose where to eat in Toronto *now*, then observes what they
do after seeing the recommendation.

Table Toronto is a dining-decision and demand layer, not a reservation
system of record. It works out which restaurants suit a moment (where you
are, the time, the weather, your preferences, how busy places are), hands
off to a reservation provider, and records the next action. It starts with
the one signal the data supports honestly, proximity, and adds others
(walking time, weather, demand) one at a time as credible sources appear,
measuring whether each changes what diners choose. Reservations
sit behind a provider port, so the app does not depend on any one booking
system; clearly labelled simulated availability stands in until a real one
is connected. See [ADR-0016](docs/architecture/adr/0016-demand-layer-and-reservation-provider-port.md)
for the reasoning and what is still open.

It is a solo reimplementation of the *Tablé* concept, rescoped from
Manhattan to Toronto, Ontario, on an open-source stack. Inspired by
[comp47360-team2](https://github.com/chukwuemekanwoke-jpg/comp47360-team2),
a team academic project. This is a fresh, independently written codebase;
it reuses the original's ideas, not its code.

**Start here:** [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md)
summarises every scope and stack decision made so far, and
[`docs/architecture/adr/`](docs/architecture/adr/README.md) holds the
authoritative record. Read them before making a change that might
contradict an earlier decision.

## What's different from the original

ADR-0016 has the full comparison; in short:

- **Product:** a decision layer that hands off to a reservation provider,
  not a marketplace that owns table inventory. The original's inventory-
  owning, ETA-gated booking flow is kept as a possible future provider
  (`direct`), not the defining model.
- **Measurement:** what a diner does after a recommendation (shown →
  opened → intent → handoff → confirmed) is part of the product. A handoff is
  never counted as a completed reservation, and simulated or demo data is
  kept apart from measured data.
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
│   ├── web-app/          # React + Vite, MapLibre GL JS (diner and manager screens)
│   ├── mobile-app/       # Expo + React Native, MapLibre native (not started)
│   └── packages/shared/  # Shared API client + types (not started)
├── backend/
│   └── api-gateway/      # Node.js/Express API: auth, restaurants, merchant, reservation providers
├── ml-pipeline/
│   ├── data/raw/         # Downloaded source data (gitignored — see scripts/)
│   ├── data/processed/   # Cleaned/joined data used for training
│   ├── notebooks/        # Exploration and feature engineering
│   └── fastapi-app/      # Busyness prediction + matching inference service (not started)
├── database/
│   ├── migrations/
│   └── scripts/          # migrate, seed, create-manager
├── infra/
│   ├── valhalla/         # Self-hosted routing engine config
│   └── caddy/            # Reverse proxy / static hosting config
└── scripts/              # Data-fetch and setup scripts
```

## Status

**Working:** the database schema (158 neighbourhoods, ~7,160 geocoded
restaurants); an API with diner registration and sign-in, preference
onboarding, and a manager-only restaurant endpoint; a web app with diner
sign-in/onboarding, a clustered restaurant map, and a manager dashboard;
the `ReservationProvider` port with a simulated mock provider; the first
diner journey (below); and integration tests for all of it.

**First diner journey (built):** the signed-in home page. A diner picks a
place on the map (or shares their location), a party size, a day and a
time; sees up to five nearest restaurants ranked by straight-line distance
alone, with the reason shown; opens one to see simulated availability; and
continues to a demonstration hand-off. Five events record the journey
(`recommendation_shown`, `restaurant_opened`, `reservation_intent`,
`handoff_started`, `booking_outcome_received`), simulated ones flagged, and
`npm run funnel --prefix backend/api-gateway` reports the funnel. A
simulated confirmation is never counted as a booking. See
[`docs/product/first-slice-diner-journey.md`](docs/product/first-slice-diner-journey.md)
and [`docs/architecture/event-contract.md`](docs/architecture/event-contract.md).

**Not built yet:** any ranking signal other than proximity; the busyness model (the training
target needs a data source that is still undecided); real reservation
availability; the mobile app; routing/ETA through Valhalla.

**Known data gaps:** the restaurant listings come from business licences,
so no restaurant has a cuisine, accessibility flag, hours or rating until a
manager fills them in or another source is added.

## Setup

```bash
cp .env.example .env     # then set JWT_SECRET and EVENT_PSEUDONYM_KEY (see the comments in the file); the rest works for local dev
docker compose up -d postgres
npm run migrate --prefix database
npm run seed:neighbourhoods --prefix database
npm install --prefix backend/api-gateway
npm start --prefix backend/api-gateway     # http://localhost:3001
npm install --prefix frontend/web-app
npm run dev --prefix frontend/web-app      # http://localhost:5173 (proxies /api to :3001)
npm test --prefix backend/api-gateway      # needs Postgres running and migrated
```

Restaurant managers are not self-service. An operator creates one and
assigns a restaurant:

```bash
npm run create-manager --prefix database -- --email owner@example.com --restaurant "<uuid or exact name>"
```

`scripts/fetch-data.sh` reproduces the raw Toronto Open Data pull used
during scoping, and `ml-pipeline/scripts/geocode_restaurants.py` +
`build_restaurant_features.py` build the restaurant-side data described
in DECISIONS.md.
