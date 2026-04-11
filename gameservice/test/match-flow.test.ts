import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { createGameController } from '../src/controllers/GameController';
import { MatchService } from '../src/services/MatchService';
import { StatsService } from '../src/services/StatsService';
import { errorHandler } from '../src/middleware/error-handler';

describe('Game match flow integration tests', () => {
  let app: Express;
  let mockMatchService: MatchService;
  let mockStatsService: StatsService;
  const userId = 1;
  const matchId = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());

    mockMatchService = {
      createMatch: vi.fn(),
      getMatch: vi.fn(),
      getMatchState: vi.fn(),
      addMove: vi.fn(),
      queueBotMove: vi.fn(),
      finishMatch: vi.fn().mockResolvedValue(undefined),
    } as unknown as MatchService;

    mockStatsService = {
      getStats: vi.fn(),
      getFullStats: vi.fn(),
    } as unknown as StatsService;

    app.use((req, res, next) => {
      (req as any).userId = userId;
      next();
    });

    app.use('/api/game', createGameController(mockMatchService, mockStatsService));
    app.use(errorHandler);
  });

  describe('Complete match flow', () => {
    it('should execute a complete match workflow', async () => {
      // Step 1: Create match
      (mockMatchService.createMatch as any).mockResolvedValue(matchId);

      const createResponse = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: 8,
            difficulty: 'medium',
          });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.matchId).toBe(matchId);

      // Step 2: Get match details
      const mockMatch = {
        id: matchId,
        user_id: userId,
        board_size: 8,
        difficulty: 'medium',
        status: 'ONGOING',
        winner: null,
        created_at: '2026-03-02T10:00:00Z',
      };

      (mockMatchService.getMatchState as any).mockResolvedValue({ ...mockMatch, botStatus: 'done' });
      (mockMatchService.getMatch as any).mockResolvedValue(mockMatch);

      const getMatchResponse = await request(app).get(`/api/game/matches/${matchId}`);

      expect(getMatchResponse.status).toBe(200);
      expect(getMatchResponse.body.status).toBe('ONGOING');

      // Step 3: Add moves
      (mockMatchService.addMove as any).mockResolvedValue(undefined);

      const moves = [
        { position_yen: 'e4', player: 'USER', moveNumber: 1 },
        { position_yen: 'e5', player: 'BOT', moveNumber: 2 },
        { position_yen: 'd4', player: 'USER', moveNumber: 3 },
      ];

      for (const move of moves) {
        const moveResponse = await request(app)
            .post(`/api/game/matches/${matchId}/moves`)
            .send(move);

        expect(moveResponse.status).toBe(202);
        expect(mockMatchService.addMove).toHaveBeenCalledWith(
            matchId,
            move.position_yen,
            move.player,
            move.moveNumber
        );
      }

      // Step 4: Finish match
      (mockMatchService.finishMatch as any).mockResolvedValue(undefined);

      const finishResponse = await request(app)
          .put(`/api/game/matches/${matchId}/finish`)
          .send({ winner: 'USER' });

      expect(finishResponse.status).toBe(200);
      expect(mockMatchService.finishMatch).toHaveBeenCalledWith(matchId, 'USER');

      // Step 5: Get final stats
      const mockDto = { totalMatches: 1, wins: 1, losses: 0, matches: [] };

      vi.spyOn(mockStatsService, 'getFullStats').mockResolvedValue(mockDto);

      const statsResponse = await request(app).get(`/api/game/stats/${userId}`);

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body.wins).toBe(1);
    });

    it('should handle multiple matches from same user', async () => {
      const matchIds = [1, 2, 3];
      let callCount = 0;

      vi.spyOn(mockMatchService, 'createMatch').mockImplementation(async () => {
        return matchIds[callCount++];
      });

      for (let i = 0; i < 3; i++) {
        const response = await request(app)
            .post('/api/game/matches')
            .send({
              boardSize: 8,
              difficulty: 'medium',
            });

        expect(response.status).toBe(201);
        expect(response.body.matchId).toBe(matchIds[i]);
      }

      expect(mockMatchService.createMatch).toHaveBeenCalledTimes(3);
    });

    it('should handle matches with different difficulties', async () => {
      const difficulties = ['easy', 'medium', 'hard'];

      for (const difficulty of difficulties) {
        vi.spyOn(mockMatchService, 'createMatch').mockResolvedValue(1);

        const response = await request(app)
            .post('/api/game/matches')
            .send({
              boardSize: 8,
              difficulty,
            });

        expect(response.status).toBe(201);
        expect(mockMatchService.createMatch).toHaveBeenCalledWith(userId, 8, difficulty, 'BOT');
      }
    });

    it('should handle match with many moves', async () => {
      const mockMatch = {
        id: matchId,
        user_id: userId,
        board_size: 8,
        difficulty: 'medium',
        status: 'ONGOING',
        winner: null,
        created_at: '2026-03-02T10:00:00Z',
      };

      vi.spyOn(mockMatchService, 'getMatch').mockResolvedValue(mockMatch);
      vi.spyOn(mockMatchService, 'addMove').mockResolvedValue(undefined);

      // Simulate 20 moves in a match
      for (let i = 1; i <= 20; i++) {
        const player = i % 2 === 1 ? 'USER' : 'BOT';
        const position = String.fromCharCode(97 + (i % 8)) + String((i % 8) + 1);

        const response = await request(app)
            .post(`/api/game/matches/${matchId}/moves`)
            .send({
              position_yen: position,
              player,
              moveNumber: i,
            });

        expect(response.status).toBe(202);
      }

      expect(mockMatchService.addMove).toHaveBeenCalledTimes(20);
    });

    it('should collect stats across multiple difficulties', async () => {
      const mockDto = { totalMatches: 5, wins: 3, losses: 2, matches: [] };

      vi.spyOn(mockStatsService, 'getFullStats').mockResolvedValue(mockDto);

      const response = await request(app).get(`/api/game/stats/${userId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockDto);
      expect(response.body.totalMatches).toBe(5);
    });
  });

  describe('Error handling in match workflow', () => {
    it('should handle service errors gracefully', async () => {
      // Spy on console.error to suppress error logs during test
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(mockMatchService, 'createMatch').mockRejectedValue(
          new Error('Database error')
      );

      const response = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: 8,
            difficulty: 'medium',
          });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();

      consoleErrorSpy.mockRestore();
    });

    it('should not allow moves on non-existent match', async () => {
      vi.spyOn(mockMatchService, 'getMatch').mockResolvedValue(undefined);

      const response = await request(app)
          .post('/api/game/matches/9999/moves')
          .send({
            position_yen: 'a1',
            player: 'USER',
            moveNumber: 1,
          });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('match_not_found');
    });

    it('should validate all parameters before processing', async () => {
      const responses = await Promise.all([
        request(app)
            .post('/api/game/matches')
            .send({
              boardSize: 'invalid',
              difficulty: 'medium',
            }),
        request(app)
            .post('/api/game/matches')
            .send({
              boardSize: 8,
              difficulty: 'unknown',
            }),
        request(app)
            .post('/api/game/matches')
            .send({
              boardSize: 8,
              difficulty: 'extreme',
            }),
      ]);

      responses.forEach((response: any) => {
        expect(response.status).toBe(400);
      });

      // Ensure service was never called
      expect(mockMatchService.createMatch).not.toHaveBeenCalled();
    });

    it('should reject invalid difficulty values', async () => {
      const response = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: 8,
            difficulty: 'impossible',
          });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent match creation requests', async () => {
      const mockIds = [1, 2, 3, 4, 5];
      let callIndex = 0;

      vi.spyOn(mockMatchService, 'createMatch').mockImplementation(async () => {
        return mockIds[callIndex++];
      });

      const requests = Array.from({ length: 5 }, (_, i) =>
          request(app)
              .post('/api/game/matches')
              .send({
                boardSize: 8,
                difficulty: 'medium',
              })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response: any, index: number) => {
        expect(response.status).toBe(201);
        expect(response.body.matchId).toBe(mockIds[index]);
      });

      expect(mockMatchService.createMatch).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrent stats requests', async () => {
      const mockDto = { totalMatches: 8, wins: 5, losses: 3, matches: [] };

      vi.spyOn(mockStatsService, 'getFullStats').mockResolvedValue(mockDto);

      const requests = Array.from({ length: 5 }, () =>
          request(app).get(`/api/game/stats/${userId}`)
      );

      const responses = await Promise.all(requests);

      responses.forEach((response: any) => {
        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockDto);
      });

      expect(mockStatsService.getFullStats).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrent move additions', async () => {
      const mockMatch = {
        id: matchId,
        user_id: userId,
        board_size: 8,
        difficulty: 'medium',
        status: 'ONGOING',
        winner: null,
        created_at: '2026-03-02T10:00:00Z',
      };

      vi.spyOn(mockMatchService, 'getMatch').mockResolvedValue(mockMatch);
      vi.spyOn(mockMatchService, 'addMove').mockResolvedValue(undefined);

      const moves = [
        { position_yen: 'a1', player: 'USER', moveNumber: 1 },
        { position_yen: 'b2', player: 'BOT', moveNumber: 2 },
        { position_yen: 'c3', player: 'USER', moveNumber: 3 },
      ];

      const requests = moves.map(move =>
          request(app)
              .post(`/api/game/matches/${matchId}/moves`)
              .send(move)
      );

      const responses = await Promise.all(requests);

      responses.forEach((response: any) => {
        expect(response.status).toBe(202);
      });

      expect(mockMatchService.addMove).toHaveBeenCalledTimes(3);
    });
  });
});