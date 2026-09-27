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
- Requires pulling Toronto's Neighbourhoods boundary dataset, which had
  not yet been done as of this ADR; it is the next pipeline step.
