import { createContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { AuthUser } from '../api/authApi'

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: AuthUser | null
}

export interface AuthContextValue extends AuthState {
  login: (token: string, refreshToken: string, user: AuthUser) => void
  logout: () => void
  updateTokens: (accessToken: string, refreshToken: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'auth_refresh_token'
const USER_KEY = 'auth_user'

function isValidAuthUser(obj: unknown): obj is AuthUser {
  return (
      typeof obj === 'object' &&
      obj !== null &&
      'id' in obj &&
      'username' in obj &&
      typeof (obj as AuthUser).id === 'number' &&
      typeof (obj as AuthUser).username === 'string'
  )
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    const userRaw = localStorage.getItem(USER_KEY)

    let user: AuthUser | null = null

    if (userRaw) {
      try {
        const parsed = JSON.parse(userRaw)
        if (isValidAuthUser(parsed)) {
          user = parsed
        } else {
          localStorage.removeItem(USER_KEY)
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(REFRESH_TOKEN_KEY)
        }
      } catch (error) {
        console.error('Error parsing user from localStorage:', error)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
      }
    }

    return { token, refreshToken, user }
  })

  const login = useCallback((token: string, refreshToken: string, user: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    setState({ token, refreshToken, user })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setState({ token: null, refreshToken: null, user: null })
  }, [])

  const updateTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    setState(prev => ({ ...prev, token: accessToken, refreshToken }))
  }, [])

  const contextValue = useMemo(
      () => ({ ...state, login, logout, updateTokens }),
      [state, login, logout, updateTokens]
  )

  return (
      <AuthContext.Provider value={contextValue}>
        {children}
      </AuthContext.Provider>
  )
}

export { AuthContext }
