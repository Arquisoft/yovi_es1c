import { ConnectionState, OpponentType } from '../../types/online';

export interface SessionStatePayload {
  matchId: string;
  layout: string;
  size: number;
  turn: 0 | 1;
  version: number;
  timerEndsAt: number;
  players: [
    { userId: number; username: string; symbol: 'B' | 'R' },
    { userId: number; username: string; symbol: 'B' | 'R' }
  ];
  winner: 'B' | 'R' | 'DRAW' | null;
  connectionStatus: ConnectionState;
  messages?: Array<{ userId: number; username: string; text: string; timestamp: number }>;
}

export interface SessionEndedPayload {
  winner: 'B' | 'R' | 'DRAW' | null;
  reason: 'FORFEIT' | 'COMPLETED';
  opponentType: OpponentType;
  revealedOpponent?: { username: string };
}
