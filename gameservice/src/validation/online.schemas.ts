import { ValidationError } from '../errors/domain-errors';

export interface QueueJoinRequest {
  boardSize: number;
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
  return { boardSize: payload.boardSize };
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
