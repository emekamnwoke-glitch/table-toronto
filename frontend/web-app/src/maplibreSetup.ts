import * as maplibregl from 'maplibre-gl'

// maplibre-gl v6 ships its worker as ES modules that import each other, which
// bundlers don't pick up; vite.config.ts serves/emits both under /maplibre/.
// Imported for its side effect by every component that creates a map.
maplibregl.setWorkerUrl(
  new URL(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`, location.origin).href,
)
