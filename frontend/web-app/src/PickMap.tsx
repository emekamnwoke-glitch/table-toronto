import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreSetup'
import { useEffect, useRef } from 'react'

const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const TORONTO: [number, number] = [-79.3832, 43.6532]

export interface Point {
  lat: number
  lng: number
}

// A map where the diner clicks to say where they are. Shows one marker.
export function PickMap({ value, onPick }: { value: Point | null; onPick: (p: Point) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const onPickRef = useRef(onPick)

  useEffect(() => {
    onPickRef.current = onPick
  })

  useEffect(() => {
    const m = new maplibregl.Map({ container: container.current!, style: STYLE, center: TORONTO, zoom: 11.5 })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.on('click', (e) => onPickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
    m.getCanvas().style.cursor = 'crosshair'
    return () => {
      m.remove()
      map.current = null
      marker.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !value) return
    if (!marker.current) marker.current = new maplibregl.Marker({ color: '#a4512a' })
    marker.current.setLngLat([value.lng, value.lat]).addTo(m)
    m.easeTo({ center: [value.lng, value.lat], zoom: Math.max(m.getZoom(), 13) })
  }, [value])

  return <div ref={container} className="map" role="application" aria-label="Map: click to choose where you are" />
}
