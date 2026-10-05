import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchRestaurants, type Restaurant } from '../api'
import { useAuth } from '../authContext'
import { Logo } from '../Logo'
import { RestaurantMap } from '../Map'

export default function Customer() {
  const { user, signOut } = useAuth()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [forMe, setForMe] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchRestaurants().then(setRestaurants).catch((e) => setError(e.message))
  }, [])

  const cuisines = user?.cuisinePreferences
  const wantsAccess = user?.accessibilityNeeds.includes('wheelchair') ?? false
  const wantsCuisine = (cuisines?.length ?? 0) > 0
  const hasPrefs = wantsCuisine || wantsAccess

  // The licence data has no cuisine or accessibility values (yet). Applying
  // those filters anyway would empty the map, so apply only what the data can
  // answer and say so for the rest.
  const dataHasCuisine = useMemo(() => restaurants.some((r) => r.cuisine), [restaurants])
  const dataHasAccess = useMemo(() => restaurants.some((r) => r.accessible), [restaurants])
  const useCuisine = wantsCuisine && dataHasCuisine
  const useAccess = wantsAccess && dataHasAccess
  const unavailable = [
    wantsCuisine && !dataHasCuisine && 'cuisine',
    wantsAccess && !dataHasAccess && 'accessibility',
  ].filter(Boolean)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return restaurants.filter((r) => {
      if (q && !(r.operating_name.toLowerCase().includes(q) || r.neighbourhood?.toLowerCase().includes(q))) {
        return false
      }
      if (!forMe) return true
      // Accessibility is a hard requirement; cuisine is a soft one, so
      // restaurants with no recorded cuisine stay in.
      if (useAccess && !r.accessible) return false
      if (useCuisine && r.cuisine && !cuisines?.includes(r.cuisine)) return false
      return true
    })
  }, [restaurants, query, forMe, useAccess, useCuisine, cuisines])

  const selected = restaurants.find((r) => r.id === selectedId) ?? null

  return (
    <div className="app">
      <aside className="panel">
        <header className="row">
          <div>
            <Logo />
            <p className="muted" style={{ marginTop: 6 }}>Hi{user?.displayName ? `, ${user.displayName}` : ''}</p>
          </div>
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </header>
        <input
          type="search"
          placeholder="Search restaurants or neighbourhoods"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {hasPrefs ? (
          <label className="check">
            <input type="checkbox" checked={forMe} onChange={(e) => setForMe(e.target.checked)} />
            Match my preferences
          </label>
        ) : null}
        {forMe && unavailable.length > 0 && (
          <p className="notice">
            We don't have {unavailable.join(' or ')} data for restaurants yet, so that preference
            isn't applied.
          </p>
        )}
        <Link to="/">Find a table near you</Link>
        <Link to="/onboarding" className="muted">
          {hasPrefs ? 'Edit preferences' : 'Set your preferences'}
        </Link>
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
