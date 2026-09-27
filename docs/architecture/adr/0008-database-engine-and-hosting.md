# ADR-0008: Database engine and hosting — self-hosted PostgreSQL + PostGIS

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project used Cloud SQL, GCP's managed Postgres offering.
Postgres itself was always open source — only the managed-service wrapper
around it was proprietary.

## Decision

PostgreSQL with the PostGIS extension, self-hosted via Docker
(`postgis/postgis:16-3.4`). Confirmed running clean during scaffolding:
container reports `healthy`, PostGIS 3.4.3 verified queryable on Postgres
16.4. Supabase (same open-source Postgres core, hosted free tier) remains
an accepted fallback if self-hosting ops overhead proves too heavy.

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
