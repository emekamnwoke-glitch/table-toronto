# ADR-0015: Geospatial Python library IO backend

**Status:** Accepted
**Date:** 2026-09-27

## Context

Building the restaurant × neighbourhood × bike-share join requires
`geopandas` for spatial joins. Its traditional IO backend, `fiona`,
requires a system GDAL installation (`GDAL_CONFIG` pointing at a working
`gdal-config`) that is not present on this Windows dev environment and is
not straightforward to install outside a conda environment.

## Decision

Install `geopandas` with `pyogrio` as the IO backend instead of `fiona` —
`pyogrio` ships its own GDAL binaries via wheels and avoids the system
`GDAL_CONFIG` dependency `fiona` needs.

## Consequences

- Confirmed working: `geopandas 1.1.4`, `pyogrio 0.13.0`, `shapely 2.1.2`
  import cleanly once installed into the correct interpreter (see root
  cause below). Removes a real cross-platform packaging headache,
  consistent with this project's general aversion to painful native
  dependencies (the same reasoning behind ADR-0006's hosting choice).
- **Root cause of the original failure was not actually GDAL** — on this
  machine, the `pip` command on `PATH` resolves to a Python 3.14
  install, while `python3` resolves to a separate Python 3.11 install
  (Windows Store alias). The first install attempt succeeded silently,
  but into the 3.14 environment, so the 3.11 interpreter used for actual
  work still couldn't import it. Fixed by always invoking
  `python3 -m pip install ...` rather than bare `pip ...`, which
  guarantees the package lands in the interpreter that will use it.
  Worth remembering for any future dependency install on this machine —
  bare `pip` is not reliable here.
