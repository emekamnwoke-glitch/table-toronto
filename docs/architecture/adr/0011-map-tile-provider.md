# ADR-0011: Map tile provider — OpenFreeMap

**Status:** Accepted
**Date:** 2026-09-27

## Context

Both the web (ADR-0009) and mobile (ADR-0010) MapLibre renderers need a
vector tile source. OpenStreetMap's own public tile servers explicitly
prohibit this kind of production app usage. The self-hosted alternative
is an OpenMapTiles + TileServer GL stack.

## Decision

OpenFreeMap — free, no API key required, no billing, MapLibre-style
compatible, purpose-built as a sustainable open alternative to
Mapbox/Google tile pricing.

## Consequences

- Zero cost and zero self-hosting burden for tiles specifically, while
  the project's stack otherwise leans toward self-hosting everything
  (ADR-0006, ADR-0008, ADR-0012, ADR-0013) — this is a deliberate
  exception to "self-host by default" because OpenFreeMap already
  removes the two things self-hosting would have bought (cost, and
  vendor billing risk).
- Remains self-hostable later if needed — OpenFreeMap publishes its own
  stack — so this isn't a one-way dependency.
