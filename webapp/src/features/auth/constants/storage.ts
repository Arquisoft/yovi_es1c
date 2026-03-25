// Security tradeoff: tokens are persisted in localStorage because the current API contract
// exchanges bearer tokens in JSON payloads (no httpOnly cookies available yet).
// This improves session persistence but is more exposed to XSS than cookie-based auth.
export const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'auth_refresh_token',
  USER: 'auth_user',
} as const
