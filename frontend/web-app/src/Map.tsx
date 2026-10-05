import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection, Point } from 'geojson'
import { useEffect, useRef } from 'react'
import type { Restaurant } from './api'

// maplibre-gl v6 ships its worker as ES modules that import each other, which
// bundlers don't pick up; vite.config.ts serves/emits both under /maplibre/.
maplibregl.setWorkerUrl(
  new URL(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`, location.origin).href,
)

// OpenFreeMap, no key required (ADR-0011).
const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const TORONTO: [number, number] = [-79.3832, 43.6532]

interface Props {
  restaurants: Restaurant[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function toGeoJSON(restaurants: Restaurant[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: restaurants.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: { id: r.id },
    })),
  }
}

export function RestaurantMap({ restaurants, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const ready = useRef(false)
  const latest = useRef({ restaurants, selectedId, onSelect })
  // Event handlers registered once on the map read the latest props from here.
  useEffect(() => {
    latest.current = { restaurants, selectedId, onSelect }
  })

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: STYLE,
      center: TORONTO,
      zoom: 10.5,
    })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    // style.load, not load: layers only need the style, and load waits on every tile.
    m.once('style.load', () => {
      m.addSource('restaurants', {
        type: 'geojson',
        data: toGeoJSON(latest.current.restaurants),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 45,
      })
      m.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'restaurants',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#2b1d14',
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 14, 25, 18, 100, 24],
        },
      })
      m.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'restaurants',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#fbf5ea' },
      })
      m.addLayer({
        id: 'points',
        type: 'circle',
        source: 'restaurants',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#c56a3c',
          'circle-radius': 5.5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fbf5ea',
        },
      })
      m.addLayer({
        id: 'selected',
        type: 'circle',
        source: 'restaurants',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': '#c56a3c',
          'circle-radius': 9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#2b1d14',
        },
      })

      m.on('click', 'clusters', async (e) => {
        const f = m.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]
        const src = m.getSource('restaurants') as maplibregl.GeoJSONSource
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id)
        m.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom })
      })
      m.on('click', 'points', (e) => latest.current.onSelect(e.features![0].properties.id))
      m.on('click', (e) => {
        if (!m.queryRenderedFeatures(e.point, { layers: ['points', 'clusters'] }).length) {
          latest.current.onSelect(null)
        }
      })
      for (const layer of ['clusters', 'points']) {
        m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'))
        m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''))
      }

      ready.current = true
      // Data/selection that arrived before the style finished loading.
      ;(m.getSource('restaurants') as maplibregl.GeoJSONSource).setData(
        toGeoJSON(latest.current.restaurants),
      )
      m.setFilter('selected', ['==', ['get', 'id'], latest.current.selectedId ?? ''])
    })

    return () => {
      m.remove()
      ready.current = false
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    ;(m.getSource('restaurants') as maplibregl.GeoJSONSource).setData(toGeoJSON(restaurants))
  }, [restaurants])

  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    m.setFilter('selected', ['==', ['get', 'id'], selectedId ?? ''])
    const r = latest.current.restaurants.find((x) => x.id === selectedId)
    if (r) m.easeTo({ center: [r.lng, r.lat], zoom: Math.max(m.getZoom(), 15) })
  }, [selectedId])

  return <div ref={container} className="map" />
}
