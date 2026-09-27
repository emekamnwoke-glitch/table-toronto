# ADR-0004: Mobility proxy — Bike Share Toronto ridership

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original model's core predictive signal was NYC TLC taxi drop-off
volume, aggregated by zone and hour. Toronto has no direct equivalent —
the closest analog, the city's Private Transportation Companies (Uber/Lyft
aggregate) vehicle operating data, is retired on the open data portal.
Alternatives evaluated: TTC subway ridership (station-level annual
totals only, and discontinued as an open dataset after 2017 — too coarse
and too stale) versus Bike Share Toronto ridership (individual,
timestamped trips, actively maintained).

## Decision

Bike Share Toronto Ridership Data as the mobility proxy. Validated during
scoping: 552,073 trips in Q1 2026 alone (the seasonal low point for
cycling), roughly 7.8 million trips across all of 2025, over 1,000
stations. Trip records join to the live GBFS `station_information` feed
for coordinates, with a 97.7% key match rate (997 of 1,020 station IDs;
the remainder are retired/renamed stations).

## Consequences

- Structurally the closest open substitute to taxi-trip data available
  for Toronto: individual, timestamped, geolocatable events rather than
  a coarse aggregate.
- Introduces two distortions the original model never had to account
  for: **seasonality** (Toronto winters show real ridership dips that
  reflect weather, not restaurant demand — unlike NYC taxi volume, which
  doesn't collapse in cold weather), and **spatial concentration**
  (dense downtown/midtown coverage, thin in the outer boroughs — compounds
  the scope trade-off accepted in ADR-0002).
- Model accuracy is expected to differ from the original's 62.7% baseline
  as a direct consequence of this substitution. That difference should be
  reported as a finding about proxy quality, not treated as an
  implementation failure.
