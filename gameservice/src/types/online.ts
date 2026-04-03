export type OpponentType = 'HUMAN' | 'BOT';
export type ConnectionState = 'CONNECTED' | 'DISCONNECTED';
export type SessionStatus = 'created' | 'active' | 'waiting_reconnect' | 'finished' | 'abandoned' | 'expired' | 'cancelled';

export interface OnlineQueueEntry {
  userId: number;
  username: string;
  boardSize: number;
  skillBand: number;
  joinedAt: number;
  socketId: string;
  queueJoinId: string;
}

export interface OnlineMatchAssignment {
  matchId: string;
  playerA: OnlineQueueEntry;
  playerB: OnlineQueueEntry | null;
  opponentType: OpponentType;
  revealAfterGame: boolean;
}

export interface OnlinePlayerState {
  userId: number;
  username: string;
  symbol: 'B' | 'R';
}

export interface OnlineChatMessage {
  userId: number;
  username: string;
  text: string;
  timestamp: number;
}

export interface OnlineSessionState {
  matchId: string;
  layout: string;
  size: number;
  turn: 0 | 1;
  version: number;
  timerEndsAt: number;
  players: [OnlinePlayerState, OnlinePlayerState];
  opponentType: OpponentType;
  status: SessionStatus;
  closeReason: 'winner' | 'abandoned' | 'expired' | 'cancelled' | null;
  connection: Record<number, ConnectionState>;
  reconnectDeadline: Record<number, number | null>;
  winner: 'B' | 'R' | 'DRAW' | null;
  messages: OnlineChatMessage[];
}

export interface QueueStatusPayload {
  state: 'queued' | 'searching';
  queuePosition?: number;
  waitedSec: number;
}

export interface MovePayload {
  matchId: string;
  move: { row: number; col: number };
  expectedVersion: number;
  clientEventId?: string;
}
