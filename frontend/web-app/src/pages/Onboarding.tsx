import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../authContext'
import { CUISINES } from '../constants'

const STYLES = [
  { value: 'casual', label: 'Casual' },
  { value: 'family', label: 'Family' },
  { value: 'date-night', label: 'Date night' },
  { value: 'business', label: 'Business' },
]
const ACCESSIBILITY = [
  { value: 'wheelchair', label: 'Wheelchair access' },
  { value: 'sensory-friendly', label: 'Sensory-friendly' },
]

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

export default function Onboarding() {
  const { user, updatePreferences } = useAuth()
  const navigate = useNavigate()
  const [cuisines, setCuisines] = useState<string[]>(user?.cuisinePreferences ?? [])
  const [budget, setBudget] = useState<number | null>(user?.budgetPreference ?? null)
  const [style, setStyle] = useState<string | null>(user?.diningStyle ?? null)
  const [needs, setNeeds] = useState<string[]>(user?.accessibilityNeeds ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function skip() {
    setError(null)
    try {
      await updatePreferences({ onboarded: true })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function save() {
    setError(null)
    setBusy(true)
    try {
      await updatePreferences({
        cuisinePreferences: cuisines,
        budgetPreference: budget,
        diningStyle: style,
        accessibilityNeeds: needs,
        onboarded: true,
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card wide">
        <h1>What are you after{user?.displayName ? `, ${user.displayName}` : ''}?</h1>
        <p className="muted">
          These tune which restaurants and offers we show you. Accessibility needs are treated as
          requirements; the rest are just preferences. You can change them any time.
        </p>

        <fieldset>
          <legend>Cuisines you like</legend>
          <div className="chips">
            {CUISINES.map((c) => (
              <button
                type="button"
                key={c}
                className={cuisines.includes(c) ? 'chip on' : 'chip'}
                aria-pressed={cuisines.includes(c)}
                onClick={() => setCuisines(toggle(cuisines, c))}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Budget</legend>
          <div className="chips">
            {[1, 2, 3, 4].map((n) => (
              <button
                type="button"
                key={n}
                className={budget === n ? 'chip on' : 'chip'}
                aria-pressed={budget === n}
                onClick={() => setBudget(budget === n ? null : n)}
              >
                {'$'.repeat(n)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Dining style</legend>
          <div className="chips">
            {STYLES.map((s) => (
              <button
                type="button"
                key={s.value}
                className={style === s.value ? 'chip on' : 'chip'}
                aria-pressed={style === s.value}
                onClick={() => setStyle(style === s.value ? null : s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Accessibility needs</legend>
          <div className="chips">
            {ACCESSIBILITY.map((a) => (
              <button
                type="button"
                key={a.value}
                className={needs.includes(a.value) ? 'chip on' : 'chip'}
                aria-pressed={needs.includes(a.value)}
                onClick={() => setNeeds(toggle(needs, a.value))}
              >
                {a.label}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
        <button className="link" onClick={skip}>
          Skip for now
        </button>
      </div>
    </main>
  )
}
