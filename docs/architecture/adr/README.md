# Architecture Decision Records

Each file here records one decision: its context, what was decided, and
the consequences accepted along with it. This is the authoritative record
— [`../DECISIONS.md`](../DECISIONS.md) is a running narrative summary that
points here, not a duplicate.

## System diagram

A single blueprint-style sheet maps every ADR below onto the running system — client apps, the self-hosted service envelope, the data foundation, and the offline data pipeline that builds it.

![Table Toronto system architecture blueprint: an ADR reference schedule beside a floor-plan-style drawing of the client apps, the self-hosted VPS envelope with the API gateway and its supporting services, the PostgreSQL/PostGIS data foundation, the offline data pipeline, and a key plan of bike-share coverage across Toronto's neighbourhoods](../table-toronto-system-diagram.svg)

[Interactive version](https://claude.ai/artifact/Nb1JdggmYPNUeZFjHr9Lnu) — scrolls better on narrow screens; private to this account, so it won't open for anyone else without being shared.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-fresh-build-not-fork.md) | Fresh, independently written codebase — not a fork | Accepted |
| [0002](0002-scope-full-amalgamated-toronto.md) | Geographic scope: full amalgamated City of Toronto | Accepted |
| [0003](0003-restaurant-data-source.md) | Restaurant listing data source: Toronto Business Licences | Accepted |
| [0004](0004-mobility-proxy-bike-share.md) | Mobility proxy: Bike Share Toronto ridership | Accepted |
| [0005](0005-zone-geometry-unit.md) | Spatial aggregation unit: Toronto Neighbourhoods, not raw DAs | Accepted |
| [0006](0006-compute-hosting-platform.md) | Compute/hosting: self-hosted Dokku or CapRover | Accepted |
| [0007](0007-web-app-hosting.md) | Web app hosting: Caddy static serving | Accepted |
| [0008](0008-database-engine-and-hosting.md) | Database: self-hosted PostgreSQL + PostGIS | Accepted |
| [0009](0009-web-map-rendering-library.md) | Web map rendering: MapLibre GL JS | Accepted |
| [0010](0010-mobile-map-rendering-approach.md) | Mobile map rendering: MapLibre native | Accepted |
| [0011](0011-map-tile-provider.md) | Map tile provider: OpenFreeMap | Accepted |
| [0012](0012-routing-eta-engine.md) | Routing/ETA engine: self-hosted Valhalla | Accepted |
| [0013](0013-geocoding-service.md) | Geocoding: Nominatim | Accepted |
| [0014](0014-push-notification-service.md) | Push notifications: Expo push (open-source exception) | Accepted |
| [0015](0015-geospatial-python-io-backend.md) | Geospatial Python IO backend: pyogrio over fiona | Accepted |

## Adding a new ADR

Number sequentially, use the format `NNNN-short-kebab-slug.md`, and follow
the existing files' structure: Status, Date, Context, Decision,
Consequences. Add a row to the table above. If a new decision replaces an
old one, mark the old ADR's status as `Superseded by ADR-NNNN` rather than
deleting it — the record of why the old choice was made is still useful.
