import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatsService } from '../src/services/StatsService';
import { StatsRepository } from '../src/repositories/StatsRepository';

describe('StatsService', () => {
  let statsService: StatsService;
  let mockStatsRepository: StatsRepository;

  beforeEach(() => {
    mockStatsRepository = {
      getUserStats: vi.fn(),
      getMatchHistory: vi.fn(),
    } as unknown as StatsRepository;

    statsService = new StatsService(mockStatsRepository);
  });

  describe('getStats', () => {
    it('should retrieve user statistics', async () => {
      const userId = 1;
      const mockStats = {
        user_id: userId,
        wins: 5,
        losses: 3,
        total_games: 8,
        win_rate: 62.5,
      };

      vi.spyOn(mockStatsRepository, 'getUserStats').mockResolvedValue(mockStats);

      const result = await statsService.getStats(userId);

      expect(result).toEqual(mockStats);
      expect(mockStatsRepository.getUserStats).toHaveBeenCalledWith(userId);
      expect(mockStatsRepository.getUserStats).toHaveBeenCalledTimes(1);
    });

    it('should return undefined when user has no stats', async () => {
      const userId = 999;

      vi.spyOn(mockStatsRepository, 'getUserStats').mockResolvedValue(undefined);

      const result = await statsService.getStats(userId);

      expect(result).toBeUndefined();
      expect(mockStatsRepository.getUserStats).toHaveBeenCalledWith(userId);
    });

    it('should handle users with 100% win rate', async () => {
      const userId = 2;
      const mockStats = {
        user_id: userId,
        wins: 10,
        losses: 0,
        total_games: 10,
        win_rate: 100,
      };

      vi.spyOn(mockStatsRepository, 'getUserStats').mockResolvedValue(mockStats);

      const result = await statsService.getStats(userId);

      expect(result?.win_rate).toBe(100);
    });

    it('should handle users with 0% win rate', async () => {
      const userId = 3;
      const mockStats = {
        user_id: userId,
        wins: 0,
        losses: 5,
        total_games: 5,
        win_rate: 0,
      };

      vi.spyOn(mockStatsRepository, 'getUserStats').mockResolvedValue(mockStats);

      const result = await statsService.getStats(userId);

      expect(result?.win_rate).toBe(0);
    });

    it('should propagate errors from repository', async () => {
      const userId = 1;

      vi.spyOn(mockStatsRepository, 'getUserStats').mockRejectedValue(
          new Error('Database connection failed')
      );

      await expect(statsService.getStats(userId)).rejects.toThrow(
          'Database connection failed'
      );
    });
  });

  describe('getWinRateForUser', () => {
    it('returns win_rate when stats exist', async () => {
      vi.spyOn(mockStatsRepository, 'getUserStats').mockResolvedValue({
        user_id: 10,
        wins: 3,
        losses: 1,
        total_games: 4,
        win_rate: 75,
      });

      await expect(statsService.getWinRateForUser(10)).resolves.toBe(75);
    });

    it('returns 0 when stats are missing', async () => {
      vi.spyOn(mockStatsRepository, 'getUserStats').mockResolvedValue(undefined);

      await expect(statsService.getWinRateForUser(999)).resolves.toBe(0);
    });
  });

  describe('getFullStats', () => {
    it('converts SQLite dates to ISO UTC format', async () => {
      vi.spyOn(mockStatsRepository, 'getUserStats').mockResolvedValue({
        user_id: 1,
        wins: 1,
        losses: 0,
        total_games: 1,
        win_rate: 100,
      });

      vi.spyOn(mockStatsRepository, 'getMatchHistory').mockResolvedValue([
        {
          id: 10,
          board_size: 8,
          difficulty: 'medium',
          status: 'FINISHED',
          winner: 'USER',
          mode: 'BOT',
          created_at: '2026-04-06 14:30:00',
        },
      ]);

      const result = await statsService.getFullStats(1);

      expect(result.matches[0]).toEqual({
        matchId: '10',
        createdAt: '2026-04-06T14:30:00Z',
        mode: 'BOT',
        status: 'win',
      });
    });

    it('keeps ISO dates unchanged', async () => {
      vi.spyOn(mockStatsRepository, 'getUserStats').mockResolvedValue({
        user_id: 1,
        wins: 0,
        losses: 1,
        total_games: 1,
        win_rate: 0,
      });

      vi.spyOn(mockStatsRepository, 'getMatchHistory').mockResolvedValue([
        {
          id: 11,
          board_size: 8,
          difficulty: 'medium',
          status: 'FINISHED',
          winner: 'BOT',
          mode: 'ONLINE',
          created_at: '2026-04-06T14:30:00Z',
        },
      ]);

      const result = await statsService.getFullStats(1);

      expect(result.matches[0]).toEqual({
        matchId: '11',
        createdAt: '2026-04-06T14:30:00Z',
        mode: 'ONLINE',
        status: 'lose',
      });
    });
  });

});
