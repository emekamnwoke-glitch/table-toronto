# ADR-0009: Web map rendering library — MapLibre GL JS

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project used the Google Maps JS SDK for the merchant web
client's map views.

## Decision

MapLibre GL JS — the actively maintained open-source fork of Mapbox GL
JS, created after Mapbox relicensed to a proprietary license.

## Consequences

- No Google Maps API key or billing dependency for the web client.
- Requires a compatible vector tile source, addressed separately in
  ADR-0011.
