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
  | 'PIE_RULE_NOT_AVAILABLE'
  | 'RECONNECT_EXPIRED'
  | 'SESSION_TERMINAL'
  | 'DUPLICATE_EVENT'
  | 'FRIEND_INVITE_NOT_FOUND'
  | 'FRIEND_INVITE_EXPIRED'
  | 'FRIEND_INVITE_FORBIDDEN'
  | 'FRIEND_INVITE_ALREADY_PENDING'
  | 'FRIENDSHIP_REQUIRED'
  | 'MATCH_ALREADY_FINISHED'
  | 'RANKING_NOT_FOUND'
  | 'INTERNAL_ERROR';

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

export function apiError(code: ApiErrorCode, message: string, details?: unknown): ApiErrorPayload {
  return details === undefined ? { code, message } : { code, message, details };
}

