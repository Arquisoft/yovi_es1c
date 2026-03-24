import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { createGameController } from '../src/controllers/GameController';
import { MatchService } from '../src/services/MatchService';
import { StatsService } from '../src/services/StatsService';
import { errorHandler } from '../src/middleware/error-handler';
import { OnlineSessionService } from '../src/services/OnlineSessionService';

describe('GameController integration tests', () => {
  let app: Express;
  let mockMatchService: MatchService;
  let mockStatsService: StatsService;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());

    mockMatchService = {
      createMatch: vi.fn(),
      getMatch: vi.fn(),
      addMove: vi.fn(),
      finishMatch: vi.fn(),
    } as unknown as MatchService;

    mockStatsService = {
      getStats: vi.fn(),
    } as unknown as StatsService;

    // Mock middleware to set userId
    app.use((req, res, next) => {
      (req as any).userId = '1';
      next();
    });

    app.use('/api/game', createGameController(mockMatchService, mockStatsService));
    app.use(errorHandler);
  });

  describe('POST /api/game/matches', () => {
    it('should create a match with valid parameters', async () => {
      const matchId = 42;
      vi.spyOn(mockMatchService, 'createMatch').mockResolvedValue(matchId);

      const response = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: 8,
            difficulty: 'medium',
          });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ matchId });
      expect(mockMatchService.createMatch).toHaveBeenCalledWith(1, 8, 'medium');
    });

    it('should validate boardSize', async () => {
      const response = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: -1,
            difficulty: 'medium',
          });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should validate difficulty', async () => {
      const response = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: 8,
            difficulty: 'impossible',
          });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should accept all valid difficulty levels', async () => {
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
      }
    });

    it('should normalize difficulty case', async () => {
      vi.spyOn(mockMatchService, 'createMatch').mockResolvedValue(1);

      const response = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: 8,
            difficulty: 'MEDIUM',
          });

      expect(response.status).toBe(201);
      expect(mockMatchService.createMatch).toHaveBeenCalledWith(1, 8, 'medium');
    });

    it('should reject request without required fields', async () => {
      const response = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: 8,
          });

      expect(response.status).toBe(400);
    });

    it('should return 401 if userId is missing', async () => {
      app = express();
      app.use(express.json());
      app.use('/api/game', createGameController(mockMatchService, mockStatsService));
      app.use(errorHandler);

      const response = await request(app)
          .post('/api/game/matches')
          .send({
            boardSize: 8,
            difficulty: 'medium',
          });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/game/matches/:id', () => {
    it('should retrieve an existing match', async () => {
      const mockMatch = {
        id: 1,
        user_id: 1,
        board_size: 8,
        difficulty: 'medium',
        status: 'ONGOING',
        winner: null,
        created_at: '2026-03-02T10:00:00Z',
      };

      vi.spyOn(mockMatchService, 'getMatch').mockResolvedValue(mockMatch);

      const response = await request(app).get('/api/game/matches/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockMatch);
      expect(mockMatchService.getMatch).toHaveBeenCalledWith(1);
    });

    it('should return 404 when match does not exist', async () => {
      vi.spyOn(mockMatchService, 'getMatch').mockResolvedValue(undefined);

      const response = await request(app).get('/api/game/matches/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('match_not_found');
    });

    it('should validate matchId parameter', async () => {
      const response = await request(app).get('/api/game/matches/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/game/matches/:id/moves', () => {
    let localMockMatchService: MatchService;
    let localMockStatsService: StatsService;

    beforeEach(() => {
      localMockMatchService = {
        createMatch: vi.fn(),
        getMatch: vi.fn().mockResolvedValue({
          id: 1,
          user_id: 1,
          board_size: 8,
          difficulty: 'medium',
          status: 'ONGOING',
          winner: null,
          created_at: '2026-03-02T10:00:00Z',
        }),
        addMove: vi.fn().mockResolvedValue(undefined),
        finishMatch: vi.fn(),
      } as unknown as MatchService;

      localMockStatsService = { getStats: vi.fn() } as unknown as StatsService;

      app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        (req as any).userId = 1;
        next();
      });
      app.use('/api/game', createGameController(localMockMatchService, localMockStatsService));
      app.use(errorHandler);
    });

    it('should add a move to an ongoing match', async () => {
      const response = await request(app)
          .post('/api/game/matches/1/moves')
          .send({
            position_yen: 'a1',
            player: 'USER',
            moveNumber: 1,
          });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Move added' });
      expect(localMockMatchService.addMove).toHaveBeenCalledWith(1, 'a1', 'USER', 1);
    });

    it('should reject move with invalid position_yen', async () => {
      const response = await request(app)
          .post('/api/game/matches/1/moves')
          .send({
            position_yen: '',
            player: 'USER',
            moveNumber: 1,
          });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject move with invalid player', async () => {
      const response = await request(app)
          .post('/api/game/matches/1/moves')
          .send({
            position_yen: 'a1',
            player: 'INVALID',
            moveNumber: 1,
          });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject move with invalid moveNumber', async () => {
      const response = await request(app)
          .post('/api/game/matches/1/moves')
          .send({
            position_yen: 'a1',
            player: 'USER',
            moveNumber: -1,
          });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject move on non-existent match', async () => {
      (localMockMatchService.getMatch as any).mockResolvedValueOnce(undefined);

      const response = await request(app)
          .post('/api/game/matches/999/moves')
          .send({
            position_yen: 'a1',
            player: 'USER',
            moveNumber: 1,
          });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('match_not_found');
    });

    it('should reject move on finished match', async () => {
      const finishedMatch = {
        id: 1,
        user_id: 1,
        board_size: 8,
        difficulty: 'medium',
        status: 'FINISHED',
        winner: 'USER',
        created_at: '2026-03-02T10:00:00Z',
      };
      (localMockMatchService.getMatch as any).mockResolvedValueOnce(finishedMatch);

      const response = await request(app)
          .post('/api/game/matches/1/moves')
          .send({
            position_yen: 'a1',
            player: 'USER',
            moveNumber: 1,
          });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_move');
    });

    it('should accept BOT as player', async () => {
      const response = await request(app)
          .post('/api/game/matches/1/moves')
          .send({
            position_yen: 'a1',
            player: 'BOT',
            moveNumber: 1,
          });

      expect(response.status).toBe(201);
      expect(localMockMatchService.addMove).toHaveBeenCalledWith(1, 'a1', 'BOT', 1);
    });
  });

  describe('GET /api/game/stats/:userId', () => {
    it('should retrieve user statistics', async () => {
      const mockStats = {
        user_id: 1,
        wins: 5,
        losses: 3,
        total_games: 8,
        win_rate: 62.5,
      };

      vi.spyOn(mockStatsService, 'getStats').mockResolvedValue(mockStats);

      const response = await request(app).get('/api/game/stats/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStats);
      expect(mockStatsService.getStats).toHaveBeenCalledWith(1);
    });

    it('should return default stats for user without history', async () => {
      vi.spyOn(mockStatsService, 'getStats').mockResolvedValue(undefined);

      const response = await request(app).get('/api/game/stats/999');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        user_id: 999,
        wins: 0,
        losses: 0,
        total_games: 0,
        win_rate: 0,
      });
    });

    it('should validate userId parameter', async () => {
      const response = await request(app).get('/api/game/stats/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject negative userId', async () => {
      const response = await request(app).get('/api/game/stats/-1');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});

describe('GET /api/game/online/sessions/active', () => {
  it('returns active session for authenticated user', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '7';
      next();
    });

    const mockOnlineSessionService = {
      getActiveSessionForUser: vi.fn().mockResolvedValue({ matchId: 'm-100', boardSize: 16 }),
    } as unknown as OnlineSessionService;

    const matchService = {} as MatchService;
    const statsService = {} as StatsService;
    app.use('/api/game', createGameController(matchService, statsService, undefined, mockOnlineSessionService));
    app.use(errorHandler);

    const response = await request(app).get('/api/game/online/sessions/active');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matchId: 'm-100', boardSize: 16 });
    expect(mockOnlineSessionService.getActiveSessionForUser).toHaveBeenCalledWith(7);
  });

  it('returns 204 when no active session exists', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '7';
      next();
    });

    const mockOnlineSessionService = {
      getActiveSessionForUser: vi.fn().mockResolvedValue(null),
    } as unknown as OnlineSessionService;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, undefined, mockOnlineSessionService));
    app.use(errorHandler);

    const response = await request(app).get('/api/game/online/sessions/active');
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('returns 401 when unauthenticated', async () => {
    const app = express();
    app.use(express.json());

    const mockOnlineSessionService = {
      getActiveSessionForUser: vi.fn(),
    } as unknown as OnlineSessionService;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, undefined, mockOnlineSessionService));
    app.use(errorHandler);

    const response = await request(app).get('/api/game/online/sessions/active');
    expect(response.status).toBe(401);
    expect(mockOnlineSessionService.getActiveSessionForUser).not.toHaveBeenCalled();
  });
});
