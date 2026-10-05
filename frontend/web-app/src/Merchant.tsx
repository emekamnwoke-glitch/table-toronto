import { useEffect, useMemo, useState } from 'react'
import { fetchRestaurants, type Restaurant } from './api'
import { Logo } from './Logo'
import { RestaurantMap } from './Map'

export default function Merchant() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchRestaurants().then(setRestaurants).catch((e) => setError(e.message))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return restaurants
    return restaurants.filter(
      (r) =>
        r.operating_name.toLowerCase().includes(q) ||
        r.neighbourhood?.toLowerCase().includes(q) ||
        r.cuisine?.toLowerCase().includes(q),
    )
  }, [restaurants, query])

  const selected = restaurants.find((r) => r.id === selectedId) ?? null

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <Logo />
          <p className="muted" style={{ marginTop: 6 }}>Merchant dashboard · <a href="/">Customer view</a></p>
        </header>
        <input
          type="search"
          placeholder="Search name, neighbourhood, cuisine"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className="error">Could not load restaurants: {error}</p>}
        {selected && (
          <section className="detail">
            <h2>{selected.operating_name}</h2>
            <p>{selected.address}</p>
            <dl>
              <dt>Neighbourhood</dt>
              <dd>{selected.neighbourhood ?? 'Unknown'}</dd>
              <dt>Cuisine</dt>
              <dd>{selected.cuisine ?? 'Not recorded'}</dd>
              <dt>Accessible</dt>
              <dd>{selected.accessible ? 'Yes' : 'No'}</dd>
              <dt>Busyness</dt>
              <dd className="muted">Pending model (needs Places API data)</dd>
            </dl>
          </section>
        )}
        <p className="muted">
          {filtered.length.toLocaleString()} of {restaurants.length.toLocaleString()} restaurants
        </p>
        <ul>
          {filtered.slice(0, 100).map((r) => (
            <li key={r.id}>
              <button className={r.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(r.id)}>
                <strong>{r.operating_name}</strong>
                <span className="muted">{r.neighbourhood ?? r.address}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <RestaurantMap restaurants={filtered} selectedId={selectedId} onSelect={setSelectedId} />
    </div>
  )
}
