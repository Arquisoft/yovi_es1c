import { MatchRules } from './rules.js';

export type OpponentType = 'HUMAN' | 'BOT';
export type FriendInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type ConnectionState = 'CONNECTED' | 'DISCONNECTED';
export type OnlineSessionSource = 'matchmaking' | 'friend';
export type SessionStatus = 'created' | 'active' | 'waiting_reconnect' | 'finished' | 'abandoned' | 'expired' | 'cancelled';

export interface OnlineQueueEntry {
  userId: number;
  username: string;
  boardSize: number;
  rules: MatchRules;
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
  rules: MatchRules;
  turn: 0 | 1;
  version: number;
  timerEndsAt: number;
  players: [OnlinePlayerState, OnlinePlayerState];
  opponentType: OpponentType;
  status: SessionStatus;
  closeReason: 'winner' | 'abandoned' | 'expired' | 'cancelled' | null;
  connection: Record<number, ConnectionState>;
  reconnectDeadline: Record<number, number | null>;
  winner: 'B' | 'R' | null;
  messages: OnlineChatMessage[];
  ranked: boolean;
  source: OnlineSessionSource;
}

export interface FriendMatchInvite {
  inviteId: string;
  requesterId: number;
  requesterName: string;
  recipientId: number;
  recipientName: string;
  boardSize: number;
  rules: MatchRules;
  ranked: false;
  source: 'friend';
  status: FriendInviteStatus;
  createdAt: number;
  expiresAt: number;
}

export interface FriendMatchReadyPayload {
  matchId: string;
  boardSize: number;
  size: number;
  rules: MatchRules;
  players: OnlinePlayerState[];
  ranked: false;
  source: 'friend';
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
export interface PieSwapPayload {
  matchId: string;
  expectedVersion: number;
  clientEventId?: string;
}