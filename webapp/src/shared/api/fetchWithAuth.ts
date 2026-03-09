import { refreshTokens } from '../../features/auth'

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'auth_refresh_token'

let refreshPromise: Promise<string> | null = null

async function getNewAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)

  if (!refreshToken) {
    throw new Error('No refresh token available')
  }

  const response = await refreshTokens(refreshToken)

  localStorage.setItem(TOKEN_KEY, response.accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken)

  return response.accessToken
}

export async function fetchWithAuth(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(init?.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response = await fetch(input, { ...init, headers })

  if (response.status === 401) {
    try {
      if (!refreshPromise) {
        refreshPromise = getNewAccessToken().finally(() => {
          refreshPromise = null
        })
      }

      const newToken = await refreshPromise

      headers.set('Authorization', `Bearer ${newToken}`)
      response = await fetch(input, { ...init, headers })
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
      throw new Error(error instanceof Error ? error.message : 'Refresh token expired')
    }

  }

  return response
}
