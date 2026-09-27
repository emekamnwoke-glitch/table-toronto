# ADR-0012: Routing/ETA engine — self-hosted Valhalla

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project used the Google Routes API (response-cached, to
manage a student budget) to validate a booking's ETA against a
restaurant's hold window across walking, driving, cycling, and transit
modes. Open-source alternatives evaluated: OSRM (fast, but car/bike/foot
only — no transit) versus Valhalla (multimodal, including transit-aware
routing) versus GraphHopper (open core, decent multimodal support).

## Decision

Valhalla, self-hosted.

## Consequences

- Matches the original's full walking/driving/cycling/transit ETA
  requirement, which OSRM alone cannot — the transit-mode ETA check is a
  functional requirement, not a nice-to-have, per the original product
  design.
- The most operationally involved of the self-hosted pieces: Valhalla
  needs a routing graph built from an OpenStreetMap extract for the
  Toronto region, and that graph needs periodic refreshing as the road
  network changes. Flagged as the highest-risk infrastructure piece to
  de-risk early, before other components are built assuming it works.
