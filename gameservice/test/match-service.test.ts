import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchService } from '../src/services/MatchService';
import { MatchRepository } from '../src/repositories/MatchRepository';

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
      const expectedId = 42;

      vi.spyOn(mockMatchRepository, 'createMatch').mockResolvedValue(expectedId);

      const result = await matchService.createMatch(userId, boardSize, difficulty);

      expect(result).toBe(expectedId);
      expect(mockMatchRepository.createMatch).toHaveBeenCalledWith(
          userId,
          boardSize,
          difficulty
      );
      expect(mockMatchRepository.createMatch).toHaveBeenCalledTimes(1);
    });

    it('should accept all difficulty levels', async () => {
      const difficulties = ['easy', 'medium', 'hard'];

      for (const difficulty of difficulties) {
        vi.spyOn(mockMatchRepository, 'createMatch').mockResolvedValue(1);

        const result = await matchService.createMatch(1, 8, difficulty);

        expect(result).toBe(1);
        expect(mockMatchRepository.createMatch).toHaveBeenCalledWith(1, 8, difficulty);
      }
    });

    it('should propagate errors from repository', async () => {
      vi.spyOn(mockMatchRepository, 'createMatch').mockRejectedValue(
          new Error('Database error')
      );

      await expect(
          matchService.createMatch(1, 8, 'medium')
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

    it('should handle draw scenario', async () => {
      const matchId = 1;
      const winner = 'DRAW';

      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);

      await matchService.finishMatch(matchId, winner);

      expect(mockMatchRepository.finishMatch).toHaveBeenCalledWith(matchId, winner);
    });
  });
});
