export type ConnectionBadgeState = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export interface QueueStatusPayload {
  state: 'queued' | 'searching';
  queuePosition?: number;
  waitedSec: number;
}

export interface MatchmakingMatchedPayload {
  matchId: string;
  opponentPublic: { username: string };
  revealAfterGame: boolean;
}

export interface SessionStatePayload {
  matchId: string;
  layout: string;
  turn: 0 | 1;
  version: number;
  timerEndsAt: number;
  connectionStatus: ConnectionBadgeState;
}

export interface MovePlayPayload {
  matchId: string;
  move: { row: number; col: number };
  expectedVersion: number;
}

export interface SessionErrorPayload {
  code: 'VERSION_CONFLICT' | 'NOT_YOUR_TURN' | 'INVALID_MOVE' | 'SESSION_NOT_FOUND';
  message: string;
}
