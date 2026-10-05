import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './authContext'
import Customer from './pages/Customer'
import Login from './pages/Login'
import Merchant from './Merchant'
import Onboarding from './pages/Onboarding'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted center">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Diners who haven't finished or skipped onboarding go through it once.
function Home() {
  const { user } = useAuth()
  if (user && !user.onboarded) return <Navigate to="/onboarding" replace />
  return <Customer />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login mode="login" />} />
      <Route path="/register" element={<Login mode="register" />} />
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      {/* Merchant login is a separate piece of work; this is still the open dashboard. */}
      <Route path="/merchant" element={<Merchant />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
