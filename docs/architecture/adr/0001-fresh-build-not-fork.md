# ADR-0001: Fresh, independently written codebase — not a fork

**Status:** Accepted
**Date:** 2026-09-27

## Context

`comp47360-team2` (the original Tablé project) is a 6-person team academic
submission. This project reimplements the same concept for Toronto as
solo portfolio work under the `emekamnwoke-glitch` account, which by
standing policy carries no AI authorship and is attributed solely to the
individual. Reusing teammates' committed code wholesale inside a
solo-attributed repository is a problem independent of any AI-authorship
question — it misattributes their work.

## Decision

Table Toronto is a fresh, independently written codebase. It reuses the
original's *architectural pattern* — the four-part monorepo split
(frontend / backend / ml-pipeline / database), the ETA-gated booking
flow, and the private flash-deal matching concept — as design inspiration
only. No code, git history, or assets are carried over from
`comp47360-team2`.

## Consequences

- More upfront implementation work — nothing is copy-pasted.
- Clean, unambiguous solo authorship throughout.
- Free to diverge from the original's specific implementation choices
  where Toronto's data or constraints differ — already exercised for
  mapping, routing, and hosting (see ADR-0006 onward).
- The original repository remains a reference for comparison but is
  never a build or runtime dependency.
