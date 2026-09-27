# ADR-0015: Geospatial Python library IO backend

**Status:** Proposed — not yet verified working
**Date:** 2026-09-27

## Context

Building the restaurant × neighbourhood × bike-share join requires
`geopandas` for spatial joins. Its traditional IO backend, `fiona`,
requires a system GDAL installation (`GDAL_CONFIG` pointing at a working
`gdal-config`) that is not present on this Windows dev environment and is
not straightforward to install outside a conda environment.

## Decision (proposed)

Install `geopandas` with `pyogrio` as the IO backend instead of `fiona` —
`pyogrio` ships its own GDAL binaries via wheels and avoids the system
dependency.

## Consequences

- If this works, it removes a real cross-platform packaging headache
  consistent with this project's general aversion to painful native
  dependencies (the same reasoning that shaped ADR-0006's hosting choice).
- **Not yet confirmed working**: the initial install attempt during
  scoping did not result in an importable `geopandas` module on this
  machine, and needs troubleshooting before this ADR can move to
  Accepted. Options if `pyogrio` doesn't resolve it: a conda/mamba
  environment (handles GDAL cleanly but adds a second package manager to
  the project), or running the geospatial join step inside a Docker
  container with GDAL preinstalled instead of the host Python
  environment.
