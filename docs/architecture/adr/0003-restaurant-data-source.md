# ADR-0003: Restaurant listing data source

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project sourced restaurant listings and attributes (rating,
review count, typical visit duration, popular-times) from the Google
Places API. For Toronto, two options were evaluated: continue with Google
Places (live coordinates and attributes in one call, but paid/quota-bound)
versus the City of Toronto's open Business Licences and Permits dataset
(free and open, but — confirmed during scoping — frozen at December 2022
with no coordinates at all).

## Decision

Toronto Business Licences and Permits, filtered to category
`EATING ESTABLISHMENT` with no `Cancel Date` (i.e. currently active).
7,278 active records as of the December 2022 snapshot. Coordinates are
added separately via geocoding (ADR-0013).

## Consequences

- Zero-cost, fully open data end to end, consistent with the project's
  open-source-infrastructure stance (ADR-0006 onward).
- The listing is stale: restaurants opened or closed after December 2022
  will be wrong in the dataset. This is a known, documented limitation,
  not an oversight — the portal's "last refreshed" metadata is misleading
  and should not be mistaken for the underlying data being current.
- The Google Places API is still used for the one field it's uniquely
  positioned to provide — the popular-times target value used to train
  the busyness model — independent of this decision.
