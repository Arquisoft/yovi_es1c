import { ValidationError } from "../errors/domain-errors";

export interface CreateMatchRequest {
  boardSize: number;
  strategy: string;
  difficulty: string;
}

export interface AddMoveRequest {
  position_yen: string;
  player: string;
  moveNumber: number;
}

export interface GetStatsRequest {
  userId: number;
}

// Validation functions
export function validateCreateMatch(data: unknown): CreateMatchRequest {
  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('Request body must be an object');
  }

  const body = data as Record<string, unknown>;
  const { boardSize, strategy, difficulty } = body;

  if (typeof boardSize !== 'number' || boardSize <= 0) {
    throw new ValidationError('boardSize must be a positive number');
  }

  if (!['CLASSIC', 'VARIANT'].includes(String(strategy))) {
    throw new ValidationError('strategy must be CLASSIC or VARIANT');
  }

  if (!['EASY', 'MEDIUM', 'HARD'].includes(String(difficulty))) {
    throw new ValidationError('difficulty must be EASY, MEDIUM, or HARD');
  }

  return { boardSize, strategy: String(strategy), difficulty: String(difficulty) };
}

export function validateAddMove(data: unknown): AddMoveRequest {
  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('Request body must be an object');
  }

  const body = data as Record<string, unknown>;
  const { position_yen, player, moveNumber } = body;

  if (typeof position_yen !== 'string' || position_yen.trim().length === 0) {
    throw new ValidationError('position_yen must be a non-empty string');
  }

  if (!['USER', 'BOT'].includes(String(player))) {
    throw new ValidationError('player must be USER or BOT');
  }

  if (typeof moveNumber !== 'number' || moveNumber <= 0) {
    throw new ValidationError('moveNumber must be a positive number');
  }

  return { position_yen, player: String(player), moveNumber };
}

export function validateUserId(userId: unknown): number {
  const id = Number(userId);
  if (isNaN(id) || id <= 0) {
    throw new ValidationError('userId must be a positive number');
  }
  return id;
}

export function validateMatchId(matchId: unknown): number {
  const id = Number(matchId);
  if (isNaN(id) || id <= 0) {
    throw new ValidationError('matchId must be a positive number');
  }
  return id;
}
