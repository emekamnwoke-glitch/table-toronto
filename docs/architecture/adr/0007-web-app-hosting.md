# ADR-0007: Web app hosting — Caddy static serving

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project served its built web client through Firebase
Hosting, a managed GCP-adjacent CDN service.

## Decision

Serve the built Vite bundle as static files via Caddy, running on the
same VPS as the rest of the stack (ADR-0006), using Caddy's built-in
automatic HTTPS.

## Consequences

- One fewer external service dependency — web hosting lives or dies with
  the same VPS as everything else, simplifying the failure surface to a
  single box to reason about.
- Loses the separate CDN edge-caching layer Firebase Hosting provided;
  acceptable at this project's expected scale, revisit if traffic ever
  demands it.
