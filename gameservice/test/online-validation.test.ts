import { describe, expect, it } from 'vitest';
import { validateMovePlay, validateQueueJoin } from '../src/validation/online.schemas';

describe('online schemas', () => {
  it('validates queue join payload', () => {
    expect(validateQueueJoin({ boardSize: 8 })).toEqual({
      boardSize: 8,
      rules: {
        pieRule: { enabled: false },
        honey: { enabled: false, blockedCells: [] },
      },
    });
  });

  it('validates queue join payload with explicit rules', () => {
    expect(validateQueueJoin({
      boardSize: 8,
      rules: {
        pieRule: { enabled: true },
        honey: { enabled: true, blockedCells: [] },
      },
    })).toEqual({
      boardSize: 8,
      rules: {
        pieRule: { enabled: true },
        honey: { enabled: true, blockedCells: [] },
      },
    });
  });

  it('rejects manual blocked cells in queue join rules', () => {
    expect(() => validateQueueJoin({
      boardSize: 8,
      rules: {
        pieRule: { enabled: false },
        honey: { enabled: true, blockedCells: [{ row: 1, col: 0 }] },
      },
    })).toThrow('rules.honey.blockedCells is generated automatically and cannot be configured manually');
  });

  it('validates move payload', () => {
    expect(validateMovePlay({ matchId: 'm1', move: { row: 0, col: 0 }, expectedVersion: 0 })).toEqual({
      matchId: 'm1',
      move: { row: 0, col: 0 },
      expectedVersion: 0,
    });
  });
});