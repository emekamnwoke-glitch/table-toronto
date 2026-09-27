# ADR-0014: Push notification service — Expo push (accepted exception to open-source-only)

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project used Firebase Cloud Messaging. Open-source
alternatives — ntfy, UnifiedPush — were evaluated against this project's
otherwise open-source-first infrastructure stance (ADR-0006 through
ADR-0013).

## Decision

Use Expo's push notification service, as a deliberate, named exception to
the project's open-source posture.

## Consequences

- Open-source push alternatives are solid on Android and web but immature
  on iOS, since Apple's APNs sits underneath any push delivery path
  regardless of what calls it — chasing full purism here has no real
  payoff and would burn effort for no user-facing benefit.
- Expo's service is free and built on the open-source Expo SDK, even
  though the actual push-relay hop stays a hosted third-party service.
- This is the **one** accepted non-self-hosted, non-fully-open dependency
  in the stack. It should not be treated as precedent for relaxing any of
  the other infrastructure ADRs — the exception is scoped to push
  delivery specifically, for the specific reason above.
