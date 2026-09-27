# Architecture & Scope Decisions

This project reimplements the *Tablé* concept (originally a Manhattan-scoped
academic MVP — see [comp47360-team2](https://github.com/chukwuemekanwoke-jpg/comp47360-team2))
for Toronto, Ontario, as an independent solo project. It is a fresh
implementation: architecture and product concept are reused as design
inspiration, but the codebase is written from scratch.

Each entry below records a decision made during project scoping, why, and
what it rules out. Update this file as decisions change — it's the record
that survives after the reasoning behind a choice is forgotten.

## Scope

**City: full amalgamated City of Toronto** (not just the pre-amalgamation
downtown core).

- Why: broader restaurant coverage and a realistic city-scale test of the
  approach.
- Trade-off accepted: the mobility-proxy feature (see below) has strong
  signal downtown/midtown and weak-to-absent signal in Scarborough,
  Etobicoke, and North York, where Bike Share Toronto has little to no
  station coverage. This should be written up as a known model limitation,
  the same way the original paper flagged its Google-popular-times proxy
  label as a limitation rather than hiding it.

**Reuse approach: fresh build, own code.**

- Why: the original repo is a 6-person team academic submission
  (`comp47360-team2`). This project is solo-authored portfolio work, and
  per [[feedback_no_ai_attribution]] portfolio repos carry no AI
  authorship — reusing teammates' committed code wholesale into a
  solo-attributed project would be its own problem independent of that.
- What carries over: the architectural pattern (four-part monorepo,
  service boundaries, ETA-gated booking flow, private flash-deal
  matching), not the code.

## Data sources

| Need | Source | Status |
|---|---|---|
| Restaurant listings | [Toronto Business Licences and Permits](https://open.toronto.ca/dataset/municipal-licensing-and-standards-business-licences-and-permits/), filtered to `EATING ESTABLISHMENT`, active (no cancel date) | 7,278 active records extracted. **Frozen at Dec 2022** — the portal's "last refreshed" metadata is misleading; the underlying CSV resource hasn't been updated since then. Chosen anyway over the Google Places API to keep the whole pipeline open/free. |
| Restaurant coordinates | Geocoded via [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap) | Validated on a 10-address sample: 100% match rate. Public API is rate-limited to 1 req/sec (polite-use policy) — full batch of 7,278 addresses is a ~2.2 hour one-time job, not a live per-request call. Self-host Nominatim if volume grows beyond one-off batches. |
| Mobility proxy (replaces NYC TLC taxi drop-offs) | [Bike Share Toronto Ridership Data](https://open.toronto.ca/dataset/bike-share-toronto-ridership-data/) | 552,073 trips confirmed in Q1 2026 alone (winter, off-peak season), ~7.8M/year in 2025. Trip-level, timestamped — structurally the closest open substitute to NYC's taxi records. |
| Mobility proxy coordinates | Live [GBFS station_information feed](https://tor.publicbikesystem.net/ube/gbfs/v1/en/station_information) | 1,071 current stations; 997 of 1,020 station IDs in the Q1-2026 trip file matched (97.7%) — the ~2% gap is retired/renamed stations, an expected and acceptable loss. |
| Zone/area geometry (replaces NYC Taxi-Zones) | [StatCan Dissemination Area boundary files](https://open.canada.ca/data/en/dataset/2dd7fed4-4e0f-406c-ab96-c29b6a9116b1) | Confirmed available as shapefiles; not yet pulled into the pipeline. |
| Land-use / venue attributes (replaces NYC PLUTO) | Not yet sourced | Toronto's open land-use data is thinner than NYC PLUTO at the same granularity — likely needs a different estimation approach than the original's commercial-area allocation rules. Open question. |
| Popular-times target | Google Places API | Same source as the original — works identically regardless of city. |

**Known limitation to carry into any write-up:** the bike-share mobility
proxy is both seasonal (Toronto winters will show real dips that aren't
"restaurants got quieter") and spatially uneven (thin outside the
downtown/midtown core) in a way NYC taxi volume wasn't. This is a genuine
open research question for the model, not just a data-engineering
inconvenience — expect model accuracy to differ from the original's 62.7%,
and treat that as a reportable finding rather than a bug.

## Infrastructure — prioritising open-source across the board

Chosen specifically to avoid a repeat of the original's GCP shutdown
(projects deleted, billing closed 2026-08-01 — see [[project_gcp_deployment]]).

| Layer | Original (Manhattan) | This project | Type |
|---|---|---|---|
| Compute/hosting | Cloud Run (GCP) | **Dokku** or **CapRover** on a VPS — git-push deploys on Docker | Fully self-hosted |
| Web hosting | Firebase Hosting | Static Vite build served via **Caddy** (automatic HTTPS) | Fully self-hosted |
| Database | Cloud SQL (managed Postgres) | **PostgreSQL + PostGIS**, self-hosted (or Supabase, same open-source core, if less ops overhead is preferred) | Fully self-hosted |
| Web map rendering | Google Maps JS SDK | **MapLibre GL JS** (open-source fork of Mapbox GL) | Open source |
| Mobile map rendering | Google Maps SDK (via react-native-maps) | **`@maplibre/maplibre-react-native`**, native module | Open source |
| Map tiles | Google tiles | **OpenFreeMap** — free, no API key, no billing | Open source, hosted free tier |
| Routing/ETA | Google Routes API | **Valhalla** — open-source multimodal routing (walking/driving/cycling/transit) | Fully self-hosted |
| Geocoding | — | **Nominatim** | Fully self-hosted |
| Push notifications | Firebase Cloud Messaging | **Expo push service** (pragmatic exception — see below) | Hosted, but built on open-source Expo SDK |
| CI | GitHub Actions | Unchanged — not in scope for this pass | — |

**Pragmatic exception: push notifications.** Open-source alternatives
(ntfy, UnifiedPush) are solid on Android/web but immature on iOS, since
Apple's APNs sits underneath regardless of what sends to it. Chasing full
purism here has no real payoff — Expo's push service stays.

**Boundary not open-source-replaceable:** the App Store and Play Store
themselves. Not a stack decision — just a fact about mobile distribution
that no infra choice changes.

## Mobile map rendering — dev workflow trade-off

Decided: **MapLibre native from the start**, not the raster-tile
`react-native-maps` fallback.

- Why: better vector rendering and light/dark theming from day one.
- Cost accepted: `@maplibre/maplibre-react-native` is a native module and
  does **not** run inside plain Expo Go. The original project's
  `npm run docker:mobile` → ngrok tunnel → Expo Go workflow doesn't apply
  as-is. Instead: `expo prebuild` to generate native projects, then
  `expo run:android` / `expo run:ios` (or an EAS dev-client build) to get
  a custom dev client with the MapLibre module compiled in. After that
  one-time setup, JS-only changes still hot-reload fast — only native
  dependency changes require a rebuild.
- Build/distribution pipeline (EAS Build vs. local `expo prebuild` +
  Android Studio/Xcode) is an open question, deliberately deferred until
  there's an actual binary to ship.

## Open questions / not yet decided

- Land-use / venue-attribute source to replace NYC PLUTO.
- Whether to self-host Postgres directly or start on Supabase for lower
  ops overhead early on.
- EAS Build vs. fully local native builds for mobile distribution.
- Final project name (working name: `table-toronto`).
