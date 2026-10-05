import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError, fetchMyRestaurant, saveMyRestaurant, type MerchantRestaurant, type Restaurant } from './api'
import { useAuth } from './authContext'
import { CUISINES } from './constants'
import { Logo } from './Logo'
import { RestaurantMap } from './Map'

export default function Merchant() {
  const { user, token, signOut } = useAuth()
  const [restaurant, setRestaurant] = useState<MerchantRestaurant | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetchMyRestaurant(token)
      .then(setRestaurant)
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Could not load your restaurant'))
  }, [token])

  // The map shows just this restaurant, reusing the customer map component.
  const pin: Restaurant[] = useMemo(
    () =>
      restaurant
        ? [
            {
              id: restaurant.id,
              operating_name: restaurant.name,
              address: restaurant.address,
              cuisine: restaurant.cuisine,
              price_level: restaurant.priceLevel,
              accessible: restaurant.accessible,
              neighbourhood: restaurant.neighbourhood,
              lng: restaurant.lng,
              lat: restaurant.lat,
            },
          ]
        : [],
    [restaurant],
  )

  return (
    <div className="app">
      <aside className="panel">
        <header className="row">
          <div>
            <Logo />
            <p className="muted" style={{ marginTop: 6 }}>
              Restaurant dashboard{user?.displayName ? ` · ${user.displayName}` : ''}
            </p>
          </div>
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </header>

        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}
        {!restaurant && !loadError && <p className="muted">Loading…</p>}
        {restaurant && token && (
          <RestaurantForm key={restaurant.id} restaurant={restaurant} token={token} onSaved={setRestaurant} />
        )}
      </aside>
      <RestaurantMap restaurants={pin} selectedId={restaurant?.id ?? null} onSelect={() => {}} />
    </div>
  )
}

function RestaurantForm({
  restaurant,
  token,
  onSaved,
}: {
  restaurant: MerchantRestaurant
  token: string
  onSaved: (r: MerchantRestaurant) => void
}) {
  const [cuisine, setCuisine] = useState(restaurant.cuisine ?? '')
  const [priceLevel, setPriceLevel] = useState(restaurant.priceLevel?.toString() ?? '')
  const [accessible, setAccessible] = useState(restaurant.accessible)
  const [seats, setSeats] = useState(restaurant.seatingCapacity?.toString() ?? '')
  const [hold, setHold] = useState(restaurant.holdWindowMinutes.toString())
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    setBusy(true)
    try {
      const saved = await saveMyRestaurant(token, {
        cuisine: cuisine.trim() || null,
        priceLevel: priceLevel ? Number(priceLevel) : null,
        accessible,
        seatingCapacity: seats ? Number(seats) : null,
        holdWindowMinutes: Number(hold),
      })
      onSaved(saved)
      setStatus({ ok: true, text: 'Saved' })
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Could not save' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="detail">
        <h2>{restaurant.name}</h2>
        <p>
          {restaurant.address}
          {restaurant.neighbourhood ? ` · ${restaurant.neighbourhood}` : ''}
        </p>
        <p className="muted">
          Name and address come from the City of Toronto business licence and can&apos;t be edited here.
        </p>
      </section>

      <form className="stack" onSubmit={submit}>
        <label>
          Cuisine
          <input list="cuisines" value={cuisine} onChange={(e) => setCuisine(e.target.value)} maxLength={50} />
          <datalist id="cuisines">
            {CUISINES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          Price
          <select value={priceLevel} onChange={(e) => setPriceLevel(e.target.value)}>
            <option value="">Not set</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {'$'.repeat(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} />
          Wheelchair accessible
        </label>
        <label>
          Seats
          <input type="number" min={1} max={2000} value={seats} onChange={(e) => setSeats(e.target.value)} />
        </label>
        <label>
          Hold a booked table for (minutes)
          <input
            type="number"
            required
            min={5}
            max={120}
            value={hold}
            onChange={(e) => setHold(e.target.value)}
          />
        </label>
        {status && (
          <p className={status.ok ? 'muted' : 'error'} role={status.ok ? 'status' : 'alert'}>
            {status.text}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </>
  )
}
