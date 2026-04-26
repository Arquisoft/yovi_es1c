import { v4 as uuidv4 } from 'uuid'

export interface AuthUser {
  id: number
  username: string
}

export interface AuthSessionResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
  session?: {
    sessionId: string
    deviceId: string
  }
}

export interface AuthErrorResponse {
  error: string
  message: string
  details?: { field: string; message: string }[]
}

const AUTH_BASE_URL = '/api/auth'
const DEVICE_ID_KEY = 'auth_device_id'

function getOrCreateDeviceId(): string {
  const current = localStorage.getItem(DEVICE_ID_KEY)
  if (current) return current
  const generated = `web-${uuidv4()}`
  localStorage.setItem(DEVICE_ID_KEY, generated)
  return generated
}

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
    const errorData = data as AuthErrorResponse
    const message =
      errorData?.message ||
      (res.status === 409
        ? 'usernameAlreadyExists'
        : 'serverError')

    throw new Error(message)
  }

  return data as TSuccess
}

export function registerUser(
  username: string,
  password: string,
): Promise<AuthSessionResponse> {
  return postJson<AuthSessionResponse>('/register', {
    username,
    password,
    deviceId: getOrCreateDeviceId(),
    deviceName: 'webapp',
  })
}

export function loginUser(
  username: string,
  password: string,
): Promise<AuthSessionResponse> {
  return postJson<AuthSessionResponse>('/login', {
    username,
    password,
    deviceId: getOrCreateDeviceId(),
    deviceName: 'webapp',
  })
}

export function refreshTokens(
    refreshToken: string,
): Promise<AuthSessionResponse> {
  return postJson<AuthSessionResponse>('/refresh', { refreshToken })
}

export async function logoutSession(): Promise<void> {
  await fetch(`${AUTH_BASE_URL}/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('auth_token')
        ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
        : {}),
    },
    body: JSON.stringify({}),
  })
}
