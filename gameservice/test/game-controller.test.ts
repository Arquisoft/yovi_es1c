import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { createGameController } from '../src/controllers/GameController';
import { MatchService } from '../src/services/MatchService';
import { StatsService } from '../src/services/StatsService';
import { errorHandler } from '../src/middleware/error-handler';
import { OnlineSessionService } from '../src/services/OnlineSessionService';
import { OnlineSessionError } from '../src/services/OnlineSessionService';

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
      getFullStats: vi.fn(),
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
      expect(mockMatchService.createMatch).toHaveBeenCalledWith(1, 8, 'medium', 'BOT');
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
      expect(mockMatchService.createMatch).toHaveBeenCalledWith(1, 8, 'medium', 'BOT');
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

      localMockStatsService = { getStats: vi.fn(), getFullStats: vi.fn() } as unknown as StatsService;

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
    it('should return StatsDto format for a user with matches', async () => {
      const mockDto = {
        totalMatches: 8,
        wins: 5,
        losses: 3,
        matches: [
          { matchId: '1', createdAt: '2026-01-01T10:00:00', mode: 'BOT', status: 'win' as const },
        ],
      };

      vi.spyOn(mockStatsService, 'getFullStats').mockResolvedValue(mockDto);

      const response = await request(app).get('/api/game/stats/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockDto);
      expect(mockStatsService.getFullStats).toHaveBeenCalledWith(1);
    });

    it('should return zeroed StatsDto for user without matches', async () => {
      const emptyDto = { totalMatches: 0, wins: 0, losses: 0, matches: [] };

      vi.spyOn(mockStatsService, 'getFullStats').mockResolvedValue(emptyDto);

      const response = await request(app).get('/api/game/stats/999');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(emptyDto);
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
    expect(response.body).toEqual({ matchId: 'm-100', boardSize: 16, status: 'active', reconnectDeadline: null });
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
    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(mockOnlineSessionService.getActiveSessionForUser).not.toHaveBeenCalled();
  });
});

describe('GameController online routes', () => {
  it('POST /online/queue returns 503 when matchmaking unavailable', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/game', createGameController({} as MatchService, {} as StatsService));
    app.use(errorHandler);

    const response = await request(app).post('/api/game/online/queue').send({ boardSize: 8 });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('POST /online/queue enqueues authenticated user', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '5';
      (req as any).username = 'alice';
      next();
    });

    const matchmakingService = {
      joinQueue: vi.fn().mockResolvedValue({ joinedAt: 123 }),
    } as any;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, matchmakingService));
    app.use(errorHandler);

    const response = await request(app).post('/api/game/online/queue').send({ boardSize: 8 });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ queued: true, joinedAt: 123 });
  });

  it('GET /online/queue/match creates session when missing snapshot', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '1';
      (req as any).username = 'alice';
      next();
    });

    const matchmakingService = {
      tryMatch: vi.fn().mockResolvedValue({
        matchId: 'online-1',
        playerA: { userId: 1, username: 'alice', boardSize: 8 },
        playerB: { userId: 2, username: 'bob', boardSize: 8 },
        revealAfterGame: false,
      }),
    } as any;

    const onlineSessionService = {
      getSnapshot: vi.fn().mockResolvedValue(null),
      createSession: vi.fn().mockResolvedValue({
        matchId: 'online-1',
        players: [
          { userId: 1, username: 'alice', symbol: 'B' },
          { userId: 2, username: 'bob', symbol: 'R' },
        ],
      }),
    } as any;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, matchmakingService, onlineSessionService));
    app.use(errorHandler);

    const response = await request(app).get('/api/game/online/queue/match');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matched: true, matchId: 'online-1', opponent: 'bob', revealAfterGame: false });
    expect(onlineSessionService.createSession).toHaveBeenCalled();
  });

  it('POST /online/sessions/:matchId/moves validates payload', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '1';
      next();
    });
    const onlineSessionService = { handleMove: vi.fn() } as any;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, undefined, onlineSessionService));
    app.use(errorHandler);

    const response = await request(app).post('/api/game/online/sessions/m1/moves').send({ move: { row: 0 } });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(onlineSessionService.handleMove).not.toHaveBeenCalled();
  });

  it('GET /online/sessions/active includes status and reconnectDeadline', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '1';
      next();
    });

    const onlineSessionService = {
      getActiveSessionForUser: vi.fn().mockResolvedValue({ matchId: 'm1', boardSize: 8 }),
      getSnapshot: vi.fn().mockResolvedValue({ status: 'waiting_reconnect', reconnectDeadline: { 1: 999 } }),
    } as any;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, undefined, onlineSessionService));
    app.use(errorHandler);

    const response = await request(app).get('/api/game/online/sessions/active');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matchId: 'm1', boardSize: 8, status: 'waiting_reconnect', reconnectDeadline: 999 });
  });

  it('POST /online/sessions/:matchId/reconnect returns 200 for valid reconnect', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '1';
      next();
    });
    const onlineSessionService = {
      reconnect: vi.fn().mockResolvedValue({ matchId: 'm1', status: 'active' }),
    } as any;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, undefined, onlineSessionService));
    app.use(errorHandler);

    const response = await request(app).post('/api/game/online/sessions/m1/reconnect').send({});
    expect(response.status).toBe(200);
    expect(response.body.matchId).toBe('m1');
  });

  it('POST /online/sessions/:matchId/reconnect returns 409 for expired reconnect', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '1';
      next();
    });
    const onlineSessionService = {
      reconnect: vi.fn().mockRejectedValue(new OnlineSessionError('RECONNECT_EXPIRED', 'Reconnect expired')),
    } as any;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, undefined, onlineSessionService));
    app.use(errorHandler);

    const response = await request(app).post('/api/game/online/sessions/m1/reconnect').send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('RECONNECT_EXPIRED');
  });

  it('POST /online/sessions/:matchId/abandon is idempotent', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).userId = '1';
      next();
    });
    const onlineSessionService = {
      abandon: vi.fn().mockResolvedValue({ matchId: 'm1', status: 'abandoned' }),
    } as any;

    app.use('/api/game', createGameController({} as MatchService, {} as StatsService, undefined, onlineSessionService));
    app.use(errorHandler);

    const first = await request(app).post('/api/game/online/sessions/m1/abandon').send({});
    const second = await request(app).post('/api/game/online/sessions/m1/abandon').send({});
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
  });
});
