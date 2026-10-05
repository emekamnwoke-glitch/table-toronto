import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ApiError,
  fetchAvailability,
  postEvents,
  recommend,
  reserve,
  type Availability,
  type ClientEvent,
  type Recommendation,
  type RecommendationItem,
  type Restaurant,
  type ReservationResult,
  type Slot,
} from '../api'
import { useAuth } from '../authContext'
import { Logo } from '../Logo'
import { RestaurantMap } from '../Map'
import { PickMap, type Point } from '../PickMap'
import { getSessionId } from '../session'

// The first-slice diner journey (docs/product/first-slice-diner-journey.md):
// ask -> nearby options -> open one -> continue -> demo hand-off.

const TIMES = Array.from({ length: 10 }, (_, i) => {
  const minutes = 17 * 60 + i * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() + i)
  return {
    value: isoDate(d),
    label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' }),
  }
})

interface FormState {
  location: Point | null
  source: 'device' | 'map_pick'
  partySize: number
  date: string
  time: string
}

type Step =
  | { kind: 'ask' }
  | { kind: 'results'; rec: Recommendation }
  | { kind: 'detail'; rec: Recommendation; item: RecommendationItem }
  | { kind: 'done'; rec: Recommendation; item: RecommendationItem; slot: Slot; result: ReservationResult }

const toRestaurant = (item: RecommendationItem): Restaurant => ({
  id: item.restaurant.id,
  operating_name: item.restaurant.name,
  address: item.restaurant.address,
  cuisine: null,
  price_level: null,
  accessible: false,
  neighbourhood: item.restaurant.neighbourhood,
  lng: item.restaurant.lng,
  lat: item.restaurant.lat,
})

export default function Find() {
  const { user, token, signOut } = useAuth()
  const sessionId = useMemo(() => getSessionId(), [])
  const [step, setStep] = useState<Step>({ kind: 'ask' })
  const [form, setForm] = useState<FormState>({
    location: null,
    source: 'map_pick',
    partySize: 2,
    date: DATES[0].value,
    time: '19:00',
  })

  // Behaviour events must never get in the diner's way: a failure is logged, not shown.
  function track(events: ClientEvent[]) {
    if (!token) return Promise.resolve()
    return postEvents(token, events).then(
      () => undefined,
      (err) => console.warn('event not recorded', err),
    )
  }

  function open(rec: Recommendation, item: RecommendationItem) {
    setStep({ kind: 'detail', rec, item })
    void track([
      {
        event_id: crypto.randomUUID(),
        event_name: 'restaurant_opened',
        occurred_at: new Date().toISOString(),
        session_id: sessionId,
        recommendation_id: rec.recommendationId,
        restaurant_id: item.restaurant.id,
        rank: item.rank,
      },
    ])
  }

  const rec = step.kind === 'ask' ? null : step.rec
  const mapRestaurants = useMemo(() => (rec ? rec.items.map(toRestaurant) : []), [rec])
  const selectedId = step.kind === 'detail' || step.kind === 'done' ? step.item.restaurant.id : null

  return (
    <div className="app">
      <aside className="panel">
        <header className="row">
          <div>
            <Logo />
            <p className="muted" style={{ marginTop: 6 }}>
              Hi{user?.displayName ? `, ${user.displayName}` : ''}
            </p>
          </div>
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </header>

        {step.kind === 'ask' && (
          <AskStep form={form} setForm={setForm} token={token} sessionId={sessionId} onResult={(r) => setStep({ kind: 'results', rec: r })} />
        )}
        {step.kind === 'results' && (
          <ResultsStep rec={step.rec} onOpen={(item) => open(step.rec, item)} onBack={() => setStep({ kind: 'ask' })} />
        )}
        {step.kind === 'detail' && token && (
          <DetailStep
            key={step.item.restaurant.id}
            rec={step.rec}
            item={step.item}
            token={token}
            sessionId={sessionId}
            track={track}
            onBack={() => setStep({ kind: 'results', rec: step.rec })}
            onDone={(slot, result) => setStep({ kind: 'done', rec: step.rec, item: step.item, slot, result })}
          />
        )}
        {step.kind === 'done' && (
          <DoneStep step={step} onAgain={() => setStep({ kind: 'ask' })} onBack={() => setStep({ kind: 'results', rec: step.rec })} />
        )}

        <Link to="/browse" className="muted">
          Browse every restaurant on the map
        </Link>
      </aside>

      {step.kind === 'ask' ? (
        <PickMap value={form.location} onPick={(p) => setForm((f) => ({ ...f, location: p, source: 'map_pick' }))} />
      ) : (
        <RestaurantMap
          fit
          restaurants={mapRestaurants}
          selectedId={selectedId}
          onSelect={(id) => {
            const item = rec?.items.find((i) => i.restaurant.id === id)
            if (rec && item) open(rec, item)
          }}
        />
      )}
    </div>
  )
}

function AskStep({
  form,
  setForm,
  token,
  sessionId,
  onResult,
}: {
  form: FormState
  setForm: (f: (prev: FormState) => FormState) => void
  token: string | null
  sessionId: string
  onResult: (r: Recommendation) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function useMyLocation() {
    setError(null)
    if (!navigator.geolocation) {
      setError('This browser cannot share your location. Click the map instead.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setForm((f) => ({ ...f, location: { lat: pos.coords.latitude, lng: pos.coords.longitude }, source: 'device' })),
      () => setError('Location was not shared. Click the map to choose where you are.'),
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!token || !form.location) return
    setError(null)
    setBusy(true)
    try {
      onResult(
        await recommend(token, {
          lat: form.location.lat,
          lng: form.location.lng,
          party_size: form.partySize,
          date: form.date,
          time: form.time,
          session_id: sessionId,
          location_source: form.source,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find options')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <h1>Where should you eat?</h1>
      <p className="muted">Tell us where you are, how many, and when. We&apos;ll show the nearest options.</p>

      <div>
        <button type="button" className="chip" onClick={useMyLocation}>
          Use my location
        </button>
        <p className="muted" style={{ marginTop: 8 }}>
          {form.location
            ? form.source === 'device'
              ? 'Using your device location.'
              : 'Location chosen on the map. Click again to move it.'
            : 'Or click the map to choose where you are.'}
        </p>
      </div>

      <label>
        Party size
        <select value={form.partySize} onChange={(e) => setForm((f) => ({ ...f, partySize: Number(e.target.value) }))}>
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'person' : 'people'}
            </option>
          ))}
        </select>
      </label>
      <label>
        Day
        <select value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}>
          {DATES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Time
        <select value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}>
          {TIMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="muted">Simulated availability runs from 17:00 to 21:30.</span>
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary" disabled={busy || !form.location}>
        {busy ? 'Finding…' : form.location ? 'Find nearby tables' : 'Choose a location first'}
      </button>
    </form>
  )
}

function ResultsStep({
  rec,
  onOpen,
  onBack,
}: {
  rec: Recommendation
  onOpen: (item: RecommendationItem) => void
  onBack: () => void
}) {
  return (
    <>
      <div>
        <h1>Nearby options</h1>
        <p className="muted">
          For {rec.request.partySize} {rec.request.partySize === 1 ? 'person' : 'people'} · {rec.request.time}
        </p>
      </div>
      <p className="notice">{rec.notice}</p>
      {rec.items.length === 0 ? (
        <p className="muted">No restaurants within {rec.radiusKm} km of that spot. Try another location.</p>
      ) : (
        <ul>
          {rec.items.map((item) => (
            <li key={item.restaurant.id}>
              <button onClick={() => onOpen(item)}>
                <strong>
                  {item.rank}. {item.restaurant.name}
                </strong>
                <span className="muted">{item.reason}</span>
                <span className="muted">{item.restaurant.neighbourhood ?? item.restaurant.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button className="link" onClick={onBack}>
        Change search
      </button>
    </>
  )
}

function DetailStep({
  rec,
  item,
  token,
  sessionId,
  track,
  onBack,
  onDone,
}: {
  rec: Recommendation
  item: RecommendationItem
  token: string
  sessionId: string
  track: (events: ClientEvent[]) => Promise<void>
  onBack: () => void
  onDone: (slot: Slot, result: ReservationResult) => void
}) {
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchAvailability(token, item.restaurant.id, rec.request)
      .then((a) => {
        if (cancelled) return
        // The server returns the nearest times first; show them in clock order.
        setAvailability({ ...a, slots: [...a.slots].sort((x, y) => x.startsAt.localeCompare(y.startsAt)) })
        setSlot(null)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load availability'))
    return () => {
      cancelled = true
    }
  }, [token, item.restaurant.id, rec.request, reloads])

  async function proceed() {
    if (!slot) return
    setError(null)
    setBusy(true)
    try {
      await track([
        {
          event_id: crypto.randomUUID(),
          event_name: 'reservation_intent',
          occurred_at: new Date().toISOString(),
          session_id: sessionId,
          recommendation_id: rec.recommendationId,
          restaurant_id: item.restaurant.id,
          party_size: rec.request.partySize,
          requested_dining_time: rec.request.requestedDiningTime,
        },
      ])
      const result = await reserve(token, {
        recommendation_id: rec.recommendationId,
        restaurant_id: item.restaurant.id,
        session_id: sessionId,
        slot_token: slot.token,
        party_size: rec.request.partySize,
        idempotency_key: crypto.randomUUID(),
      })
      onDone(slot, result)
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'SLOT_UNAVAILABLE' || err.code === 'SLOT_EXPIRED')) {
        setError('That time is no longer available. Pick another.')
        setReloads((n) => n + 1)
      } else {
        setError(err instanceof Error ? err.message : 'Could not continue')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="link" onClick={onBack}>
        ← Back to the list
      </button>
      <section className="detail">
        <h2>{item.restaurant.name}</h2>
        <p>
          {item.restaurant.address}
          {item.restaurant.neighbourhood ? ` · ${item.restaurant.neighbourhood}` : ''}
        </p>
        <dl>
          <dt>Why it&apos;s here</dt>
          <dd>{item.reason}</dd>
          <dt>Rank</dt>
          <dd>
            {item.rank} of {rec.items.length}, by distance only
          </dd>
        </dl>
      </section>

      <div>
        <h2>
          Times near {rec.request.time} <span className="badge">Simulated</span>
        </h2>
        <p className="muted">{availability?.notice ?? 'Loading…'}</p>
        {availability && availability.slots.length === 0 && (
          <p className="muted">No simulated times near then. Try another time.</p>
        )}
        <div className="chips" style={{ marginTop: 8 }}>
          {availability?.slots.map((s) => (
            <button
              key={s.token}
              type="button"
              className={slot?.token === s.token ? 'chip on' : 'chip'}
              aria-pressed={slot?.token === s.token}
              onClick={() => setSlot(s)}
            >
              {s.localTime}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={!slot || busy} onClick={proceed}>
        {busy ? 'Continuing…' : 'Continue to reservation'}
      </button>
    </>
  )
}

function DoneStep({
  step,
  onAgain,
  onBack,
}: {
  step: Extract<Step, { kind: 'done' }>
  onAgain: () => void
  onBack: () => void
}) {
  const { item, slot, result, rec } = step
  return (
    <>
      {result.simulated && (
        <p className="notice" role="status">
          {result.notice ?? 'Demonstration. No real reservation was made.'}
        </p>
      )}
      <section className="detail">
        <h2>{result.simulated ? 'Simulated booking' : 'Booking confirmed'}</h2>
        <p>{item.restaurant.name}</p>
        <dl>
          <dt>When</dt>
          <dd>
            {DATES.find((d) => d.value === rec.request.date)?.label ?? rec.request.date}, {slot.localTime}
          </dd>
          <dt>Party</dt>
          <dd>{rec.request.partySize}</dd>
          <dt>Source</dt>
          <dd>{result.simulated ? 'Simulated availability' : result.providerId}</dd>
        </dl>
      </section>
      <button className="primary" onClick={onAgain}>
        Start a new search
      </button>
      <button className="link" onClick={onBack}>
        Back to the list
      </button>
    </>
  )
}
