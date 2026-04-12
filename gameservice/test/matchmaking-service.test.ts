import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchService } from '../src/services/MatchService';
import { MatchRepository } from '../src/repositories/MatchRepository';
import { MatchRules } from '../src/types/rules';

const classicRules: MatchRules = {
  pieRule: { enabled: false },
  honey: { enabled: false, blockedCells: [] },
};

describe('MatchService', () => {
  let matchService: MatchService;
  let mockMatchRepository: MatchRepository;

  beforeEach(() => {
    mockMatchRepository = {
      createMatch: vi.fn(),
      getMatchById: vi.fn(),
      addMove: vi.fn(),
      finishMatch: vi.fn(),
    } as unknown as MatchRepository;

    matchService = new MatchService(mockMatchRepository);
  });

  describe('createMatch', () => {
    it('should create a match with valid parameters', async () => {
      const userId = 1;
      const boardSize = 8;
      const difficulty = 'medium';
      const mode = 'BOT';
      const expectedId = 42;

      vi.spyOn(mockMatchRepository, 'createMatch').mockResolvedValue(expectedId);

      const result = await matchService.createMatch(userId, boardSize, difficulty, mode);

      expect(result).toBe(expectedId);
      expect(mockMatchRepository.createMatch).toHaveBeenCalledWith(userId, boardSize, difficulty, mode, classicRules);
      expect(mockMatchRepository.createMatch).toHaveBeenCalledTimes(1);
    });

    it('should default mode to BOT when not provided', async () => {
      vi.spyOn(mockMatchRepository, 'createMatch').mockResolvedValue(1);

      await matchService.createMatch(1, 8, 'medium');

      expect(mockMatchRepository.createMatch).toHaveBeenCalledWith(1, 8, 'medium', 'BOT', classicRules);
    });

    it('should accept all valid modes', async () => {
      const modes = ['BOT', 'ONLINE', 'LOCAL_2P'];

      for (const mode of modes) {
        vi.spyOn(mockMatchRepository, 'createMatch').mockResolvedValue(1);

        await matchService.createMatch(1, 8, 'easy', mode);

        expect(mockMatchRepository.createMatch).toHaveBeenCalledWith(1, 8, 'easy', mode, classicRules);
      }
    });

    it('should accept all difficulty levels', async () => {
      const difficulties = ['easy', 'medium', 'hard'];

      for (const difficulty of difficulties) {
        vi.spyOn(mockMatchRepository, 'createMatch').mockResolvedValue(1);

        await matchService.createMatch(1, 8, difficulty, 'BOT');

        expect(mockMatchRepository.createMatch).toHaveBeenCalledWith(1, 8, difficulty, 'BOT', classicRules);
      }
    });

    it('should propagate errors from repository', async () => {
      vi.spyOn(mockMatchRepository, 'createMatch').mockRejectedValue(
          new Error('Database error')
      );

      await expect(
          matchService.createMatch(1, 8, 'medium', 'BOT')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getMatch', () => {
    it('should retrieve a match by id', async () => {
      const matchId = 1;
      const mockMatch = {
        id: matchId,
        user_id: 1,
        board_size: 8,
        difficulty: 'medium',
        status: 'ONGOING',
        winner: null,
        created_at: '2026-03-02T10:00:00Z',
      };

      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue(mockMatch);

      const result = await matchService.getMatch(matchId);

      expect(result).toEqual(mockMatch);
      expect(mockMatchRepository.getMatchById).toHaveBeenCalledWith(matchId);
      expect(mockMatchRepository.getMatchById).toHaveBeenCalledTimes(1);
    });

    it('should return undefined when match does not exist', async () => {
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue(undefined);

      const result = await matchService.getMatch(999);

      expect(result).toBeUndefined();
      expect(mockMatchRepository.getMatchById).toHaveBeenCalledWith(999);
    });
  });

  describe('addMove', () => {
    it('should add a move to a match', async () => {
      const matchId = 1;
      const position = 'a1';
      const player = 'USER';
      const moveNumber = 1;

      vi.spyOn(mockMatchRepository, 'addMove').mockResolvedValue(undefined);

      await matchService.addMove(matchId, position, player, moveNumber);

      expect(mockMatchRepository.addMove).toHaveBeenCalledWith(
          matchId,
          position,
          player,
          moveNumber
      );
      expect(mockMatchRepository.addMove).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors when adding move fails', async () => {
      vi.spyOn(mockMatchRepository, 'addMove').mockRejectedValue(
          new Error('Move validation failed')
      );

      await expect(
          matchService.addMove(1, 'a1', 'USER', 1)
      ).rejects.toThrow('Move validation failed');
    });
  });

  describe('finishMatch', () => {
    it('should finish a match with a winner', async () => {
      const matchId = 1;
      const winner = 'USER';

      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);

      await matchService.finishMatch(matchId, winner);

      expect(mockMatchRepository.finishMatch).toHaveBeenCalledWith(matchId, winner);
      expect(mockMatchRepository.finishMatch).toHaveBeenCalledTimes(1);
    });

    it('should handle BOT as winner', async () => {
      const matchId = 1;
      const winner = 'BOT';

      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);

      await matchService.finishMatch(matchId, winner);

      expect(mockMatchRepository.finishMatch).toHaveBeenCalledWith(matchId, winner);
    });
  });
});