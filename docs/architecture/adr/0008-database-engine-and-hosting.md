# ADR-0008: Database engine and hosting — self-hosted PostgreSQL + PostGIS

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project used Cloud SQL, GCP's managed Postgres offering.
Postgres itself was always open source — only the managed-service wrapper
around it was proprietary.

## Decision

PostgreSQL with the PostGIS extension, self-hosted via Docker
(`postgis/postgis:16-3.4`) on the same VPS as everything else (ADR-0006).
Confirmed running clean during scaffolding: container reports `healthy`,
PostGIS 3.4.3 verified queryable on Postgres 16.4.

Supabase (same open-source Postgres core, hosted free tier) was
considered and rejected as the final choice, not just left as a
fallback:

- It would reintroduce a second infrastructure dependency outside the
  "one VPS to reason about" model ADR-0006 and ADR-0007 deliberately
  built toward, plus a network hop for every DB query instead of a
  same-host connection.
- Supabase's free tier pauses a project after a period of inactivity —
  a bad fit for a solo project without continuous traffic, and exactly
  the kind of "someone else's infrastructure decision affects whether
  this still works" risk the project's entire open-source, self-hosted
  posture (ADR-0006 through ADR-0014) exists to avoid.
- Self-hosting is already fully validated with zero remaining setup
  cost — there's no ops-overhead problem left to solve by switching.

## Consequences

- PostGIS unlocks real geospatial queries for the restaurant ×
  neighbourhood join (ADR-0005) — an upgrade over the original, which
  listed PostGIS as merely "optional" and never actually required it.
- Self-hosting means backup/restore, version upgrades, and
  connection-pool tuning are this project's responsibility. Notably, the
  original's own load test found Cloud SQL's default 10-connection
  ceiling was its actual bottleneck at 100 concurrent users — a
  self-hosted instance removes that specific ceiling but replaces it with
  "whatever this project configures," which needs deliberate attention
  rather than inheriting a sane managed default.
- This is now a closed decision, not a placeholder — the database always
  lives on the same VPS as the API gateway and Valhalla/Nominatim, with
  no managed-service escape hatch kept in reserve.
