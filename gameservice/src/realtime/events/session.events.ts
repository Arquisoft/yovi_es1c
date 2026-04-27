import { ConnectionState, OnlineSessionSource, OpponentType } from '../../types/online';
import { MatchRules } from '../../types/rules.js';

export interface SessionStatePayload {
  matchId: string;
  layout: string;
  size: number;
  rules: MatchRules;
  turn: 0 | 1;
  version: number;
  timerEndsAt: number;
  players: [
    { userId: number; username: string; symbol: 'B' | 'R' },
    { userId: number; username: string; symbol: 'B' | 'R' }
  ];
  winner: 'B' | 'R' | null;
  connectionStatus: ConnectionState;
  messages?: Array<{ userId: number; username: string; text: string; timestamp: number }>;
  ranked?: boolean;
  source?: OnlineSessionSource;
}

export interface SessionEndedPayload {
  winner: 'B' | 'R' | null;
  reason: 'FORFEIT' | 'COMPLETED';
  opponentType: OpponentType;
  revealedOpponent?: { username: string };
}