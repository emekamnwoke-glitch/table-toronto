import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './authContext'
import Customer from './pages/Customer'
import Find from './pages/Find'
import Login from './pages/Login'
import Merchant from './Merchant'
import Onboarding from './pages/Onboarding'

function RequireAuth({ children, to = '/login' }: { children: ReactNode; to?: string }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted center">Loading…</p>
  if (!user) return <Navigate to={to} replace />
  return children
}

// Restaurant dashboard: managers only. A signed-in diner gets a dead end
// with a way out, not a redirect loop. (The API enforces this too.)
function RequireManager({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  if (user?.role !== 'manager') {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Restaurant accounts only</h1>
          <p className="muted">You&apos;re signed in as a diner. The restaurant dashboard needs a manager account.</p>
          <Link to="/">Back to the map</Link>
          <button
            className="link"
            onClick={() => {
              signOut()
            }}
          >
            Sign out and use another account
          </button>
        </div>
      </main>
    )
  }
  return children
}

// Managers have their own dashboard; diners who haven't finished or skipped
// onboarding go through it once.
function Home() {
  const { user } = useAuth()
  if (user?.role === 'manager') return <Navigate to="/merchant" replace />
  if (user && !user.onboarded) return <Navigate to="/onboarding" replace />
  return <Find />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login mode="login" />} />
      <Route path="/register" element={<Login mode="register" />} />
      <Route path="/merchant/login" element={<Login mode="login" audience="manager" />} />
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/browse" element={<RequireAuth><Customer /></RequireAuth>} />
      <Route
        path="/merchant"
        element={
          <RequireAuth to="/merchant/login">
            <RequireManager>
              <Merchant />
            </RequireManager>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
