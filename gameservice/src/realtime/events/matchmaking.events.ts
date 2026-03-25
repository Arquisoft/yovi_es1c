import { QueueStatusPayload } from '../../types/online';

export interface QueueJoinPayload {
  boardSize: number;
}

export interface MatchmakingMatchedPayload {
  matchId: string;
  opponentPublic: { username: string };
  revealAfterGame: boolean;
}

export interface MatchmakingServerEvents {
  'queue:status': (payload: QueueStatusPayload) => void;
  'matchmaking:matched': (payload: MatchmakingMatchedPayload) => void;
}
