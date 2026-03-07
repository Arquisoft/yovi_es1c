import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatsService } from '../src/services/StatsService';
import { StatsRepository } from '../src/repositories/StatsRepository';

describe('StatsService', () => {
  let statsService: StatsService;
  let mockStatsRepository: StatsRepository;

  beforeEach(() => {
    mockStatsRepository = {
      getUserStats: vi.fn(),
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
});
