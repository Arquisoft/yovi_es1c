export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_TOKEN'
  | 'AUTH_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'SESSION_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'NOT_YOUR_TURN'
  | 'INVALID_MOVE'
  | 'RECONNECT_EXPIRED'
  | 'SESSION_TERMINAL'
  | 'DUPLICATE_EVENT'
  | 'INTERNAL_ERROR';

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

export function apiError(code: ApiErrorCode, message: string, details?: unknown): ApiErrorPayload {
  return details === undefined ? { code, message } : { code, message, details };
}

