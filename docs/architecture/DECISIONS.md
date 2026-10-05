# Architecture & Scope Decisions — Summary

This project reimplements the *Tablé* concept (originally a Manhattan-scoped
academic MVP — see [comp47360-team2](https://github.com/chukwuemekanwoke-jpg/comp47360-team2))
for Toronto, Ontario, as an independent solo project. It is a fresh
implementation: architecture and product concept are reused as design
inspiration, but the codebase is written from scratch.

**The authoritative decision record is [`adr/`](adr/README.md)** — one file
per decision, each with its own context, decision, and consequences. This
page is a narrative summary for quick orientation; when the two disagree,
the ADR is correct.

## Scope and approach

- Full amalgamated City of Toronto, not just the downtown core — [ADR-0002](adr/0002-scope-full-amalgamated-toronto.md).
- Fresh, independently written codebase, not a fork of the team project — [ADR-0001](adr/0001-fresh-build-not-fork.md).

## Data pipeline

- Restaurants: Toronto Business Licences (frozen at Dec 2022, geocoded separately) — [ADR-0003](adr/0003-restaurant-data-source.md).
- Mobility proxy (replaces NYC taxi drop-offs): Bike Share Toronto ridership — [ADR-0004](adr/0004-mobility-proxy-bike-share.md).
- Spatial join unit: Toronto Neighbourhoods, not raw census Dissemination Areas — [ADR-0005](adr/0005-zone-geometry-unit.md).
- Geocoding: Nominatim, one-time batch, self-host if volume grows — [ADR-0013](adr/0013-geocoding-service.md).

**Standing limitation to carry into any write-up:** the bike-share
mobility proxy is both seasonal and spatially uneven (thin outside
downtown/midtown) in a way NYC taxi volume wasn't. Measured at
restaurant grain once trips were actually joined: **375 of 7,211 seeded
restaurants (5.2%) have zero mobility signal for every hour** — see
ADR-0005's refinement note for why this supersedes the earlier
station-presence estimate. Expect model accuracy to differ from the
original's 62.7% — treat that as a reportable finding, not a bug.

**Feature matrix status:** `ml-pipeline/scripts/build_feature_matrix.py`
builds the restaurant x weekday x hour grid, but only 3 of the original's
9 feature groups are populated (mobility demand, cyclical time, weekday
flags). Rating, review count, visit duration, restaurant area, turnover
rate, takeaway ratio, and the busyness-level target itself are all still
empty placeholder columns. The Google Places route that would have filled
them is closed ([ADR-0017](adr/0017-no-google-places-content.md)): the Places
API has no popular-times data and its terms forbid the storage and model
training this needed. The busyness target has no legitimate source yet.

## Infrastructure — open source end to end

Chosen to avoid repeating the original's GCP shutdown (projects deleted,
billing closed 2026-08-01).

| Layer | Decision | ADR |
|---|---|---|
| Compute/hosting | Dokku or CapRover on a VPS | [0006](adr/0006-compute-hosting-platform.md) |
| Web hosting | Caddy static serving | [0007](adr/0007-web-app-hosting.md) |
| Database | PostgreSQL + PostGIS, self-hosted | [0008](adr/0008-database-engine-and-hosting.md) |
| Web maps | MapLibre GL JS | [0009](adr/0009-web-map-rendering-library.md) |
| Mobile maps | MapLibre native | [0010](adr/0010-mobile-map-rendering-approach.md) |
| Map tiles | OpenFreeMap | [0011](adr/0011-map-tile-provider.md) |
| Routing/ETA | Valhalla, self-hosted | [0012](adr/0012-routing-eta-engine.md) |
| Geocoding | Nominatim | [0013](adr/0013-geocoding-service.md) |
| Push notifications | Expo push (accepted exception) | [0014](adr/0014-push-notification-service.md) |

## Product direction

TABLE Toronto is positioned as a dining-decision and demand layer, not a
reservation system of record. The principle: help someone choose where to
eat now, then observe what they do after seeing the recommendation. The
app works out where someone should eat right now, hands off to a
reservation provider, and records the next action (shown → opened →
intent → handoff → confirmed, with handoffs never counted as completed
reservations). The first recommendation signal is proximity (straight-line
distance, labelled as such); further signals are added one at a time once
a credible source exists, each as its own measured ranking version. Reservations sit behind
a `ReservationProvider` port (a simulated `mock` provider exists; `direct`
and any third-party adapter come later), and simulated data is labelled
end to end — [ADR-0016](adr/0016-demand-layer-and-reservation-provider-port.md).
Status: accepted (ADR-0016), with a few questions still open: whether any third-party reservation API is obtainable, the source for "how busy now", and the fate of the original's flash-deal mechanism.

## Mobile dev workflow

MapLibre native from day one means `expo prebuild` + a custom dev client,
not the original's plain Expo Go tunnel workflow — see
[ADR-0010](adr/0010-mobile-map-rendering-approach.md) for the full trade-off.

## Open / unresolved

- Land-use / venue-attribute source to replace NYC PLUTO — no ADR yet.
- Dokku vs. CapRover final pick — deferred to actual VPS provisioning.
- EAS Build vs. fully local native builds for mobile distribution.
- Final project name (working name: `table-toronto`).
- A legitimate source for the busyness training target and any "how busy now"
  signal. Google Places is ruled out ([ADR-0017](adr/0017-no-google-places-content.md)).
  Candidates, all unmeasured: OpenStreetMap tags, manager-entered data,
  manager-reported current busyness.
