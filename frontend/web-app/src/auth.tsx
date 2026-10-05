import { useCallback, useEffect, useState, type ReactNode } from 'react'
import * as api from './api'
import { AuthContext, type AuthState } from './authContext'

const TOKEN_KEY = 'tt.token'

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode / blocked storage: the session just won't survive a reload.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken)
  const [user, setUser] = useState<api.User | null>(null)
  const [checked, setChecked] = useState(false)

  const signOut = useCallback(() => {
    writeToken(null)
    setToken(null)
    setUser(null)
  }, [])

  useEffect(() => {
    if (!token || user) return
    let cancelled = false
    api
      .fetchMe(token)
      .then((u) => !cancelled && setUser(u))
      .catch((e) => {
        // Only an auth failure invalidates the token; a network blip shouldn't log people out.
        if (e instanceof api.ApiError && e.status === 401) signOut()
      })
      .finally(() => !cancelled && setChecked(true))
    return () => {
      cancelled = true
    }
  }, [token, user, signOut])

  const accept = ({ token: t, user: u }: { token: string; user: api.User }) => {
    writeToken(t)
    setToken(t)
    setUser(u)
  }

  // Loading only while a stored token is still being verified.
  const loading = token !== null && user === null && !checked

  const value: AuthState = {
    user,
    loading,
    signIn: async (email, password) => accept(await api.login(email, password)),
    signUp: async (email, password, name) => accept(await api.register(email, password, name)),
    signOut,
    updatePreferences: async (prefs) => {
      if (token) setUser(await api.savePreferences(token, prefs))
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
