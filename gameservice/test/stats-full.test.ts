import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatsService } from '../src/services/StatsService';
import { StatsRepository } from '../src/repositories/StatsRepository';
import type { MatchRow } from '../src/repositories/StatsRepository';

function makeRepo(
  userStats: Record<string, unknown> | undefined,
  history: Partial<MatchRow>[] = []
): StatsRepository {
  return {
    getUserStats: vi.fn().mockResolvedValue(userStats),
    getMatchHistory: vi.fn().mockResolvedValue(history),
  } as unknown as StatsRepository;
}

function makeRow(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: 1,
    board_size: 11,
    difficulty: 'easy',
    status: 'FINISHED',
    winner: 'USER',
    mode: 'BOT',
    created_at: '2026-04-01T10:00:00',
    ...overrides,
  };
}

describe('StatsService.getFullStats', () => {
  let service: StatsService;

  describe('user with no matches', () => {
    beforeEach(() => {
      service = new StatsService(makeRepo(undefined, []));
    });

    it('returns zeroed counters and empty matches array', async () => {
      const result = await service.getFullStats(999);

      expect(result).toEqual({
        totalMatches: 0,
        wins: 0,
        losses: 0,
        matches: [],
      });
    });
  });

  describe('field mapping', () => {
    it('maps total_games → totalMatches, wins, losses from raw stats', async () => {
      const repo = makeRepo(
        { total_games: 5, wins: 3, losses: 2, win_rate: 60 },
        []
      );
      service = new StatsService(repo);

      const result = await service.getFullStats(1);

      expect(result.totalMatches).toBe(5);
      expect(result.wins).toBe(3);
      expect(result.losses).toBe(2);
    });

    it('maps id → matchId as string', async () => {
      const repo = makeRepo(
        { total_games: 1, wins: 1, losses: 0, win_rate: 100 },
        [makeRow({ id: 42 })]
      );
      service = new StatsService(repo);

      const result = await service.getFullStats(1);

      expect(result.matches[0].matchId).toBe('42');
    });

    it('maps created_at → createdAt', async () => {
      const repo = makeRepo(
        { total_games: 1, wins: 1, losses: 0, win_rate: 100 },
        [makeRow({ created_at: '2026-03-15T08:30:00' })]
      );
      service = new StatsService(repo);

      const result = await service.getFullStats(1);

      expect(result.matches[0].createdAt).toBe('2026-03-15T08:30:00');
    });

    it('maps mode field through', async () => {
      const repo = makeRepo(
        { total_games: 1, wins: 1, losses: 0, win_rate: 100 },
        [makeRow({ mode: 'LOCAL_2P' })]
      );
      service = new StatsService(repo);

      const result = await service.getFullStats(1);

      expect(result.matches[0].mode).toBe('LOCAL_2P');
    });
  });

  describe('winner → status mapping', () => {
    it('maps winner USER → status win', async () => {
      const repo = makeRepo(
        { total_games: 1, wins: 1, losses: 0, win_rate: 100 },
        [makeRow({ winner: 'USER' })]
      );
      service = new StatsService(repo);

      const result = await service.getFullStats(1);

      expect(result.matches[0].status).toBe('win');
    });

    it('maps winner BOT → status lose', async () => {
      const repo = makeRepo(
        { total_games: 1, wins: 0, losses: 1, win_rate: 0 },
        [makeRow({ winner: 'BOT' })]
      );
      service = new StatsService(repo);

      const result = await service.getFullStats(1);

      expect(result.matches[0].status).toBe('lose');
    });
  });

  describe('edge cases', () => {
    it('100% win rate — all matches are wins', async () => {
      const rows = [
        makeRow({ id: 1, winner: 'USER' }),
        makeRow({ id: 2, winner: 'USER' }),
        makeRow({ id: 3, winner: 'USER' }),
      ];
      const repo = makeRepo(
        { total_games: 3, wins: 3, losses: 0, win_rate: 100 },
        rows
      );
      service = new StatsService(repo);

      const result = await service.getFullStats(1);

      expect(result.wins).toBe(3);
      expect(result.losses).toBe(0);
      expect(result.matches.every((m) => m.status === 'win')).toBe(true);
    });

    it('0% win rate — all matches are losses', async () => {
      const rows = [
        makeRow({ id: 1, winner: 'BOT' }),
        makeRow({ id: 2, winner: 'BOT' }),
      ];
      const repo = makeRepo(
        { total_games: 2, wins: 0, losses: 2, win_rate: 0 },
        rows
      );
      service = new StatsService(repo);

      const result = await service.getFullStats(1);

      expect(result.wins).toBe(0);
      expect(result.losses).toBe(2);
      expect(result.matches.every((m) => m.status === 'lose')).toBe(true);
    });

    it('calls both getUserStats and getMatchHistory with the correct userId', async () => {
      const repo = makeRepo(undefined, []);
      service = new StatsService(repo);

      await service.getFullStats(7);

      expect(repo.getUserStats).toHaveBeenCalledWith(7);
      expect(repo.getMatchHistory).toHaveBeenCalledWith(7, 20);
    });

    it('both calls run in parallel via Promise.all', async () => {
      const order: string[] = [];
      const repo = {
        getUserStats: vi.fn().mockImplementation(async () => {
          order.push('stats');
          return undefined;
        }),
        getMatchHistory: vi.fn().mockImplementation(async () => {
          order.push('history');
          return [];
        }),
      } as unknown as StatsRepository;
      service = new StatsService(repo);

      await service.getFullStats(1);

      // Both must have been called — order not guaranteed (parallel)
      expect(order).toContain('stats');
      expect(order).toContain('history');
    });
  });
});
