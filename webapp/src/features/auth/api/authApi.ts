export interface AuthUser {
  id: number
  username: string
}

export interface AuthSessionResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface AuthErrorResponse {
  error: string
  message: string
  details?: { field: string; message: string }[]
}

const AUTH_BASE_URL = '/api/auth'

async function postJson<TSuccess>(
  path: string,
  body: unknown,
): Promise<TSuccess> {
  const res = await fetch(`${AUTH_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => ({}))) as
    | TSuccess
    | AuthErrorResponse
    | Record<string, unknown>

  if (!res.ok) {
    // Devolvemos un error estructurado para que el formulario pueda mostrarlo
    const errorData = data as AuthErrorResponse
    const message =
      errorData?.message ||
      (res.status === 409
        ? 'Username already exists'
        : 'Server error')

    throw new Error(message)
  }

  return data as TSuccess
}

export function registerUser(
  username: string,
  password: string,
): Promise<AuthSessionResponse> {
  return postJson<AuthSessionResponse>('/register', { username, password })
}

export function loginUser(
  username: string,
  password: string,
): Promise<AuthSessionResponse> {
  return postJson<AuthSessionResponse>('/login', { username, password })
}

