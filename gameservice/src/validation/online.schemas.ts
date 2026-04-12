import { ValidationError } from '../errors/domain-errors';
import { cloneDefaultMatchRules, MatchRules } from '../types/rules.js';

export interface QueueJoinRequest {
  boardSize: number;
  rules: MatchRules;
}

export interface MovePlayRequest {
  matchId: string;
  move: { row: number; col: number };
  expectedVersion: number;
}

export function validateQueueJoin(data: unknown): QueueJoinRequest {
  if (typeof data !== 'object' || data === null) throw new ValidationError('Request body must be an object');
  const payload = data as Record<string, unknown>;
  if (typeof payload.boardSize !== 'number' || payload.boardSize <= 0) {
    throw new ValidationError('boardSize must be a positive number');
  }
  return { boardSize: payload.boardSize, rules: validateQueueRules(payload.rules) };
}

function validateQueueRules(data: unknown): MatchRules {
  const normalized = cloneDefaultMatchRules();
  if (data === undefined) return normalized;
  if (typeof data !== 'object' || data === null) throw new ValidationError('rules must be an object');
  const raw = data as Record<string, unknown>;

  if (raw.pieRule !== undefined) {
    if (typeof raw.pieRule !== 'object' || raw.pieRule === null) throw new ValidationError('rules.pieRule must be an object');
    const pie = raw.pieRule as Record<string, unknown>;
    if (pie.enabled !== undefined && typeof pie.enabled !== 'boolean') throw new ValidationError('rules.pieRule.enabled must be a boolean');
    normalized.pieRule.enabled = pie.enabled === true;
  }

  if (raw.honey !== undefined) {
    if (typeof raw.honey !== 'object' || raw.honey === null) throw new ValidationError('rules.honey must be an object');
    const honey = raw.honey as Record<string, unknown>;
    if (honey.enabled !== undefined && typeof honey.enabled !== 'boolean') throw new ValidationError('rules.honey.enabled must be a boolean');
    normalized.honey.enabled = honey.enabled === true;

    if (honey.blockedCells !== undefined) {
      if (!Array.isArray(honey.blockedCells)) throw new ValidationError('rules.honey.blockedCells must be an array');
      normalized.honey.blockedCells = honey.blockedCells.map((cell, index) => {
        if (typeof cell !== 'object' || cell === null) {
          throw new ValidationError(`rules.honey.blockedCells[${index}] must be an object`);
        }
        const blocked = cell as Record<string, unknown>;
        if (
            !Number.isInteger(blocked.row)
            || Number(blocked.row) < 0
            || !Number.isInteger(blocked.col)
            || Number(blocked.col) < 0
        ) {
          throw new ValidationError(`rules.honey.blockedCells[${index}] requires non-negative integer row and col`);
        }
        return { row: Number(blocked.row), col: Number(blocked.col) };
      });
    }
  }

  if (!normalized.honey.enabled && normalized.honey.blockedCells.length > 0) {
    throw new ValidationError('rules.honey.blockedCells requires rules.honey.enabled=true');
  }

  return normalized;
}

export function validateMovePlay(data: unknown): MovePlayRequest {
  if (typeof data !== 'object' || data === null) throw new ValidationError('Request body must be an object');
  const payload = data as Record<string, unknown>;
  if (typeof payload.matchId !== 'string' || payload.matchId.length === 0) throw new ValidationError('matchId is required');
  const move = payload.move as Record<string, unknown>;
  if (!move || typeof move.row !== 'number' || typeof move.col !== 'number') {
    throw new ValidationError('move.row and move.col are required');
  }
  if (typeof payload.expectedVersion !== 'number' || payload.expectedVersion < 0) {
    throw new ValidationError('expectedVersion must be a non negative number');
  }
  return {
    matchId: payload.matchId,
    move: { row: move.row, col: move.col },
    expectedVersion: payload.expectedVersion,
  };
}