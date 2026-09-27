# ADR-0010: Mobile map rendering — MapLibre native, accepting the Expo Go trade-off

**Status:** Accepted
**Date:** 2026-09-27

## Context

The original project used Google Maps via `react-native-maps` under
Expo. Two open-source-compatible options were evaluated for this
project's Expo/React Native mobile client:

- `@maplibre/maplibre-react-native` — a native module, vector tiles,
  proper light/dark theming, best rendering quality.
- `react-native-maps` with a raster `UrlTile` layer pointed at an
  open tile source — runs inside plain Expo Go with no native build
  step, but coarser rendering and no client-side style theming.

## Decision

`@maplibre/maplibre-react-native`, accepted from the start despite its
workflow cost.

## Consequences

- This is a native module: it does **not** run inside plain Expo Go. The
  original project's dev loop (`npm run docker:mobile` → ngrok tunnel →
  Expo Go on a phone) does not apply as-is.
- Replaced by: `expo prebuild` once, to generate native Android/iOS
  projects, then `expo run:android` / `expo run:ios` (or an EAS
  dev-client build) to produce a custom dev client with the MapLibre
  module compiled in. After that one-time setup, JS-only changes still
  hot-reload normally — only native-dependency changes require a rebuild.
- Chosen deliberately over the faster-to-start raster-tile fallback
  because rendering quality and theming matter specifically for the
  mobile client, which the original paper identified as the primary
  surface for addressing consumer-side search costs.
- Depends on ADR-0011 for the actual tile source.
