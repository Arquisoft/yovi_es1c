import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchService } from '../src/services/MatchService';
import { MatchRepository } from '../src/repositories/MatchRepository';
import { RankingService } from '../src/services/RankingService';
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
      listMoves: vi.fn(),
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

    it('generates Honey blocked cells when Honey is enabled without configured cells', async () => {
      vi.spyOn(mockMatchRepository, 'createMatch').mockResolvedValue(1);
      const rules: MatchRules = {
        pieRule: { enabled: true },
        honey: { enabled: true, blockedCells: [] },
      };

      await matchService.createMatch(1, 8, 'easy', 'BOT', rules);

      expect(mockMatchRepository.createMatch).toHaveBeenCalledWith(
          1,
          8,
          'easy',
          'BOT',
          expect.objectContaining({
            pieRule: { enabled: true },
            honey: expect.objectContaining({
              enabled: true,
              blockedCells: expect.arrayContaining([
                expect.objectContaining({ row: expect.any(Number), col: expect.any(Number) }),
              ]),
            }),
          }),
      );
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

  describe('queueBotMove', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('uses fallback move when bot call times out', async () => {
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 1, user_id: 1, board_size: 3, status: 'ONGOING',
      } as any);
      vi.spyOn(mockMatchRepository, 'listMoves').mockResolvedValue([
        { position_yen: 'a1', player: 'USER', move_number: 1 },
      ] as any);
      vi.spyOn(mockMatchRepository, 'addMove').mockResolvedValue(undefined);

      vi.spyOn(globalThis, 'fetch' as any).mockImplementation(
          async (...args: any[]) =>
              new Promise((_, reject) => {
                const options = args[1] as RequestInit | undefined;
                (options?.signal as AbortSignal).addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
              }),
      );

      matchService.queueBotMove(1);
      await new Promise((resolve) => setTimeout(resolve, 650));

      expect(mockMatchRepository.addMove).toHaveBeenCalledWith(1, 'b1', 'BOT', 2);
      const state = await matchService.getMatchState(1);
      expect(state?.botStatus).toBe('done');
    });

    it('applies bot move when bot responds within timeout', async () => {
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 1, user_id: 1, board_size: 3, status: 'ONGOING',
      } as any);
      vi.spyOn(mockMatchRepository, 'listMoves').mockResolvedValue([
        { position_yen: 'a1', player: 'USER', move_number: 1 },
      ] as any);
      vi.spyOn(mockMatchRepository, 'addMove').mockResolvedValue(undefined);

      vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
        ok: true,
        json: async () => ({ position_yen: 'c1' }),
      } as Response);

      matchService.queueBotMove(1);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMatchRepository.addMove).toHaveBeenCalledWith(1, 'c1', 'BOT', 2);
      const state = await matchService.getMatchState(1);
      expect(state?.botStatus).toBe('done');
    });

    it.each([
      {
        label: 'classic match sends explicit no-extras rules',
        storedRules: undefined,
        expectedRules: {
          pieRule: { enabled: false },
          honey: { enabled: false, blockedCells: [] },
        },
      },
      {
        label: 'pie-only match propagates pie rule',
        storedRules: {
          pieRule: { enabled: true },
          honey: { enabled: false, blockedCells: [] },
        },
        expectedRules: {
          pieRule: { enabled: true },
          honey: { enabled: false, blockedCells: [] },
        },
      },
      {
        label: 'honey-only match propagates blocked cells',
        storedRules: {
          pieRule: { enabled: false },
          honey: { enabled: true, blockedCells: [{ row: 1, col: 0 }] },
        },
        expectedRules: {
          pieRule: { enabled: false },
          honey: { enabled: true, blockedCells: [{ row: 1, col: 0 }] },
        },
      },
      {
        label: 'both-enabled match propagates both extras',
        storedRules: {
          pieRule: { enabled: true },
          honey: { enabled: true, blockedCells: [{ row: 2, col: 1 }] },
        },
        expectedRules: {
          pieRule: { enabled: true },
          honey: { enabled: true, blockedCells: [{ row: 2, col: 1 }] },
        },
      },
    ])('$label', async ({ storedRules, expectedRules }) => {
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 1,
        user_id: 1,
        board_size: 3,
        status: 'ONGOING',
        rules: storedRules,
      } as any);
      vi.spyOn(mockMatchRepository, 'listMoves').mockResolvedValue([
        { position_yen: 'a1', player: 'USER', move_number: 1 },
      ] as any);
      vi.spyOn(mockMatchRepository, 'addMove').mockResolvedValue(undefined);

      const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
        ok: true,
        json: async () => ({ position_yen: 'c1' }),
      } as Response);

      matchService.queueBotMove(1);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
      const payload = JSON.parse(String(requestInit.body)) as { rules: MatchRules };
      expect(payload.rules).toEqual(expectedRules);
    });

    it('parses persisted JSON-string rules before calling gamey', async () => {
      const storedRules = JSON.stringify({
        pieRule: { enabled: true },
        honey: { enabled: true, blockedCells: [{ row: 0, col: 0 }] },
      });
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 1,
        user_id: 1,
        board_size: 3,
        status: 'ONGOING',
        rules: storedRules,
      } as any);
      vi.spyOn(mockMatchRepository, 'listMoves').mockResolvedValue([
        { position_yen: 'a1', player: 'USER', move_number: 1 },
      ] as any);
      vi.spyOn(mockMatchRepository, 'addMove').mockResolvedValue(undefined);
      const fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
        ok: true,
        json: async () => ({ position_yen: 'c1' }),
      } as Response);

      matchService.queueBotMove(1);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const requestInit = fetchSpy.mock.calls[0][1] as RequestInit;
      const payload = JSON.parse(String(requestInit.body)) as { rules: MatchRules };
      expect(payload.rules).toEqual({
        pieRule: { enabled: true },
        honey: { enabled: true, blockedCells: [{ row: 0, col: 0 }] },
      });
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

  describe('finishMatch ranking integration', () => {
    let mockRanking: RankingService;
    let serviceWithRanking: MatchService;

    beforeEach(() => {
      mockRanking = {
        applyRatingUpdate: vi.fn().mockResolvedValue(null),
        getOpponentRatingForUser: vi.fn().mockResolvedValue(1350),
      } as unknown as RankingService;
      serviceWithRanking = new MatchService(mockMatchRepository, mockRanking);
    });

    it('triggers BOT rating update using match difficulty', async () => {
      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 10, user_id: 5, mode: 'BOT', difficulty: 'hard',
      } as any);

      await serviceWithRanking.finishMatch(10, 'USER');

      expect(mockRanking.applyRatingUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 5,
            matchId: 10,
            mode: 'BOT',
            difficulty: 'hard',
            result: 'WIN',
          }),
      );
    });

    it('maps BOT winner as LOSS for the human player', async () => {
      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 11, user_id: 5, mode: 'BOT', difficulty: 'medium',
      } as any);

      await serviceWithRanking.finishMatch(11, 'BOT');

      expect(mockRanking.applyRatingUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ mode: 'BOT', result: 'LOSS' }),
      );
    });

    it('skips ranking for LOCAL_2P matches', async () => {
      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 12, user_id: 5, mode: 'LOCAL_2P',
      } as any);

      await serviceWithRanking.finishMatch(12, 'USER');

      expect(mockRanking.applyRatingUpdate).not.toHaveBeenCalled();
    });

    it('resolves opponent rating from opponent userId for ONLINE matches', async () => {
      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 20, user_id: 5, mode: 'ONLINE',
      } as any);

      await serviceWithRanking.finishMatch(20, 'USER', 99);

      expect(mockRanking.getOpponentRatingForUser).toHaveBeenCalledWith(99);
      expect(mockRanking.applyRatingUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 5,
            matchId: 20,
            mode: 'ONLINE',
            result: 'WIN',
            opponentRating: 1350,
          }),
      );
    });

    it('does not block the finish when the ranking update fails', async () => {
      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);
      vi.spyOn(mockMatchRepository, 'getMatchById').mockResolvedValue({
        id: 30, user_id: 5, mode: 'BOT', difficulty: 'easy',
      } as any);
      (mockRanking.applyRatingUpdate as any).mockRejectedValueOnce(new Error('ranking down'));

      await expect(serviceWithRanking.finishMatch(30, 'USER')).resolves.toBeUndefined();
      expect(mockMatchRepository.finishMatch).toHaveBeenCalledWith(30, 'USER');
    });

    it('is a no-op when no RankingService is injected', async () => {
      vi.spyOn(mockMatchRepository, 'finishMatch').mockResolvedValue(undefined);
      const getSpy = vi.spyOn(mockMatchRepository, 'getMatchById');

      await matchService.finishMatch(40, 'USER');

      expect(getSpy).not.toHaveBeenCalled();
    });
  });
});