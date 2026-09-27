# ADR-0005: Spatial aggregation unit — Toronto Neighbourhoods, not raw Dissemination Areas

**Status:** Accepted
**Date:** 2026-09-27
**Supersedes:** the informal assumption, made during initial scoping, that
StatCan Dissemination Areas would directly replace NYC's taxi zones.

## Context

The original model joined restaurants, taxi volume, and demand features
through NYC's 60 TLC taxi zones — a granularity coarse enough that each
zone aggregates a meaningful volume of trips. Two Toronto candidates were
considered: StatCan Dissemination Areas (DAs — the standard census small
area, but there are roughly 3,700+ of them across Toronto, each covering
only 400–700 people) versus the City of Toronto's official Neighbourhoods
boundaries (140–158 city-defined areas, already used across other Toronto
open datasets).

Raw DAs are roughly 50–60× finer-grained than NYC's 60 zones. Joining
bike-share trips (already a thinner, more unevenly distributed signal
than taxi volume — see ADR-0004) down to DA level would fragment counts
into thousands of near-empty buckets, especially in the outer boroughs
where station coverage is already sparse.

## Decision

Use the City of Toronto's official Neighbourhoods boundaries (open data)
as the primary spatial join unit between restaurants and mobility-proxy
trip counts — granularity comparable to the original's 60 taxi zones.

## Consequences

- Avoids fragmenting an already-thinner signal into statistically
  meaningless per-zone counts.
- Directly comparable in spirit to the original's zone granularity,
  making the eventual model results easier to interpret against the
  original's reported performance.
- StatCan DA boundaries are not discarded — they remain available as a
  finer secondary geography if a future feature (e.g. land-use or
  venue-attribute estimation) needs sub-neighbourhood precision — but
  they are not the primary busyness-join unit.
- Confirmed working: all 158 official neighbourhoods loaded from Toronto
  Open Data (EPSG:4326), and every one of the 1,071 live bike-share
  stations spatially joined cleanly to exactly one neighbourhood polygon
  (100% match, no stations fell outside all boundaries).
- Quantifies the ADR-0002/0004 coverage trade-off precisely: **18 of 158
  neighbourhoods (11.4%) have zero bike-share stations** — all in
  Scarborough, North York, and Etobicoke (e.g. Malvern East, Rexdale-Kipling,
  Centennial Scarborough). Restaurants in those neighbourhoods will have
  no mobility-proxy signal at all, not just a weak one. This is the
  concrete number behind the "thin outer-borough coverage" limitation
  and should be cited directly in any model write-up.
