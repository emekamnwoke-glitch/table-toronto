# ADR-0002: Geographic scope — full amalgamated City of Toronto

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project deliberately scoped to Manhattan rather than all of
NYC's five boroughs, keeping the area dense and walkable. Two comparable
options were considered for Toronto: the pre-amalgamation downtown/midtown
core (closest analog to Manhattan's density) versus the full modern,
amalgamated City of Toronto (adds Scarborough, Etobicoke, North York,
York, and East York).

## Decision

Full amalgamated City of Toronto.

## Consequences

- Larger restaurant base and a realistic city-scale test of the approach,
  rather than a narrow, cherry-picked-dense core.
- Accepted trade-off: the bike-share mobility-proxy signal (ADR-0004) is
  strong downtown/midtown and weak-to-absent in the outer boroughs, so
  per-restaurant feature quality is uneven across the scope. This is a
  known limitation to report honestly, not a bug to hide — matching the
  posture the original paper took toward its own proxy-label limitation.
- If model evaluation later shows outer-borough predictions are too
  degraded to be useful, this ADR should be revisited and superseded
  with a narrower scope.
