import { createContext, useContext } from 'react'
import type * as api from './api'

export interface AuthState {
  user: api.User | null
  /** True until the stored token (if any) has been checked against the API. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<api.User>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => void
  /** The signed-in session token, for calls the context does not wrap. */
  token: string | null
  updatePreferences: (prefs: api.Preferences) => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
