import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { AuthUser } from '../api/authApi'

interface AuthState {
  token: string | null
  user: AuthUser | null
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    const userRaw = localStorage.getItem(USER_KEY)
    const user = userRaw ? (JSON.parse(userRaw) as AuthUser) : null
    return { token, user }
  })

  const login = useCallback((token: string, user: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    setState({ token, user })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setState({ token: null, user: null })
  }, [])

  const contextValue = useMemo(
    () => ({ ...state, login, logout }),
    [state, login, logout]
  )

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
