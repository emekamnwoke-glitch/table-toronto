# ADR-0013: Geocoding service — Nominatim

**Status:** Accepted
**Date:** 2026-09-27

## Context

The chosen restaurant listing source (ADR-0003) has no coordinates, only
street addresses — coordinates must be added separately.

## Decision

Nominatim, the OpenStreetMap-based geocoder. Validated during scoping on
a 10-address sample: 100% match rate, correctly resolving addresses
across both downtown and outer-borough locations (e.g. correctly placing
a Lawrence Ave E address in Scarborough).

## Consequences

- The public Nominatim instance is rate-limited to 1 request/second under
  its usage policy. Geocoding all 7,278 active restaurant listings is a
  one-time ~2.2 hour batch job, not something to call live per-request —
  results must be cached/persisted, not re-fetched on demand.
- Self-host Nominatim if geocoding volume grows beyond occasional batch
  jobs (e.g. if the restaurant source is refreshed on a recurring
  schedule rather than as a one-off snapshot).
