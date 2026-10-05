import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../authContext'
import { Logo } from '../Logo'

export default function Login({
  mode,
  audience = 'diner',
}: {
  mode: 'login' | 'register'
  audience?: 'diner' | 'manager'
}) {
  const { user, signIn, signUp, signOut } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const registering = mode === 'register'
  const manager = audience === 'manager'

  if (user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (registering) await signUp(email, password, name)
      else {
        const signedIn = await signIn(email, password)
        if (manager && signedIn.role !== 'manager') {
          signOut()
          setError('This account is not a restaurant account. Diners sign in on the main page.')
          return
        }
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-split">
      <section className="brand-panel">
        <Logo inverse />
        <div>
          <p className="brand-line">{manager ? 'Fill the tables you have tonight.' : 'A table for tonight, anywhere in Toronto.'}</p>
          <p className="brand-sub">
            {manager
              ? 'Keep your restaurant details current so the right diners find you.'
              : 'Browse restaurants across all 158 neighbourhoods and see how busy they are before you go.'}
          </p>
        </div>
        <svg className="brand-motif" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="92" />
          <circle cx="100" cy="100" r="64" />
          <circle cx="100" cy="100" r="36" />
        </svg>
      </section>

      <section className="form-panel">
        <form className="auth-card" onSubmit={submit}>
          <h1>{registering ? 'Create your account' : manager ? 'Restaurant sign in' : 'Welcome back'}</h1>
          <p className="muted">
            {registering
              ? 'It takes a minute. You can set your tastes next.'
              : manager
                ? 'For restaurant managers. Your account is set up by the Table Toronto team.'
                : 'Sign in to find a table.'}
          </p>
          {registering && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={registering ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={registering ? 'new-password' : 'current-password'}
            />
            {registering && <span className="muted">At least 8 characters</span>}
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
          </button>
          <p className="muted">
            {manager ? (
              <>
                Not a restaurant? <Link to="/login">Diner sign in</Link>
              </>
            ) : registering ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <>
                New here? <Link to="/register">Create an account</Link>
              </>
            )}
          </p>
          {!manager && (
            <p className="muted">
              Restaurant manager? <Link to="/merchant/login">Sign in here</Link>
            </p>
          )}
        </form>
      </section>
    </main>
  )
}
