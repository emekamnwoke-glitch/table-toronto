# ADR-0006: Compute/hosting platform — self-hosted Dokku or CapRover

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project deployed to Google Cloud Run. That GCP project was
later deleted and its billing account closed (2026-08-01), permanently
losing the deployed environment. This project explicitly prioritises
open-source infrastructure to avoid repeating that failure mode.

## Decision

Self-host on a VPS using Dokku or CapRover (final pick deferred until
actual provisioning) — both open-source, Docker-based, git-push deploy
platforms. The project's existing `docker-compose.yml` pattern ports to
either directly.

## Consequences

- No recurring managed-platform billing, and no risk of a third party
  unilaterally deleting the deployment.
- The developer is now the ops team: OS patching, Docker daemon
  maintenance, and platform upgrades are self-managed rather than
  outsourced to a cloud provider.
- Migration path to a managed platform remains open later if the ops
  burden proves too heavy — nothing here is a one-way door.
