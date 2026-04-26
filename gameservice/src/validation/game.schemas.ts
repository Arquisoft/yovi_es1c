import { ValidationError } from "../errors/domain-errors.js";
import { cloneDefaultMatchRules, MatchRules } from "../types/rules.js";

export interface CreateMatchRequest {
  boardSize: number;
  difficulty: string;
  mode: string;
  rules: MatchRules;
}

const VALID_MODES = ['BOT', 'ONLINE', 'LOCAL_2P'] as const;

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
  const { boardSize, difficulty, mode } = body;

  if (typeof boardSize !== 'number' || boardSize <= 0) {
    throw new ValidationError('boardSize must be a positive number');
  }

  const normalizedDifficulty = String(difficulty).toLowerCase();

  if (!['easy', 'medium', 'hard', 'impossible'].includes(normalizedDifficulty)) {
    throw new ValidationError('difficulty must be easy, medium, hard or impossible');
  }

  if (mode !== undefined && typeof mode !== 'string') {
    throw new ValidationError('mode must be a string');
  }
  const normalizedMode = mode === undefined ? 'BOT' : mode.toUpperCase();

  if (!(VALID_MODES as readonly string[]).includes(normalizedMode)) {
    throw new ValidationError('mode must be BOT, ONLINE or LOCAL_2P');
  }

  const rules = validateMatchRules(body.rules);

  return { boardSize, difficulty: normalizedDifficulty, mode: normalizedMode, rules };
}

function validateMatchRules(data: unknown): MatchRules {
  if (data === undefined) {
    return cloneDefaultMatchRules();
  }

  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('rules must be an object');
  }

  const raw = data as Record<string, unknown>;
  const normalized = cloneDefaultMatchRules();

  if (raw.pieRule !== undefined) {
    if (typeof raw.pieRule !== 'object' || raw.pieRule === null) {
      throw new ValidationError('rules.pieRule must be an object');
    }
    const pieRule = raw.pieRule as Record<string, unknown>;
    if (pieRule.enabled !== undefined && typeof pieRule.enabled !== 'boolean') {
      throw new ValidationError('rules.pieRule.enabled must be a boolean');
    }
    normalized.pieRule.enabled = pieRule.enabled === true;
  }

  if (raw.honey !== undefined) {
    if (typeof raw.honey !== 'object' || raw.honey === null) {
      throw new ValidationError('rules.honey must be an object');
    }
    const honey = raw.honey as Record<string, unknown>;
    if (honey.enabled !== undefined && typeof honey.enabled !== 'boolean') {
      throw new ValidationError('rules.honey.enabled must be a boolean');
    }
    normalized.honey.enabled = honey.enabled === true;

    if (honey.blockedCells !== undefined) {
      if (!Array.isArray(honey.blockedCells)) {
        throw new ValidationError('rules.honey.blockedCells must be an array');
      }
      if (honey.blockedCells.length > 0) {
        throw new ValidationError('rules.honey.blockedCells is generated automatically and cannot be configured manually');
      }
    }
  }

  if (!normalized.honey.enabled && normalized.honey.blockedCells.length > 0) {
    throw new ValidationError('rules.honey.blockedCells requires rules.honey.enabled=true');
  }

  return normalized;
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

export interface FinishMatchRequest {
  winner: string;
}

export function validateFinishMatch(data: unknown): FinishMatchRequest {
  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('Request body must be an object');
  }

  const body = data as Record<string, unknown>;
  const { winner } = body;

  if (!['USER', 'BOT'].includes(String(winner))) {
    throw new ValidationError('winner must be USER or BOT');
  }

  return { winner: String(winner) };
}