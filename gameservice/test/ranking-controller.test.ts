import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { createGameController } from '../src/controllers/GameController';
import { MatchService } from '../src/services/MatchService';
import { StatsService } from '../src/services/StatsService';
import { RankingService } from '../src/services/RankingService';
import { errorHandler } from '../src/middleware/error-handler';

describe('GameController ranking endpoints', () => {
    let app: Express;
    let mockRanking: RankingService;

    const buildApp = (ranking?: RankingService) => {
        const built = express();
        built.use(express.json());
        built.use((req, _res, next) => {
            (req as any).userId = '1';
            next();
        });
        const matchService = {} as MatchService;
        const statsService = {} as StatsService;
        built.use('/api/game', createGameController(matchService, statsService, undefined, undefined, ranking));
        built.use(errorHandler);
        return built;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockRanking = {
            getLeaderboard: vi.fn(),
            getUserRanking: vi.fn(),
        } as unknown as RankingService;
        app = buildApp(mockRanking);
    });

    describe('GET /api/game/rankings', () => {
        it('returns the leaderboard with default pagination', async () => {
            vi.spyOn(mockRanking, 'getLeaderboard').mockResolvedValue({
                total: 2,
                limit: 20,
                offset: 0,
                entries: [
                    { rank: 1, userId: 5, username: 'alice', eloRating: 1500, gamesPlayed: 10, peakRating: 1500, lastUpdated: 'now' },
                    { rank: 2, userId: 7, username: 'bob', eloRating: 1300, gamesPlayed: 4, peakRating: 1320, lastUpdated: 'now' },
                ],
            });

            const response = await request(app).get('/api/game/rankings');

            expect(response.status).toBe(200);
            expect(response.body.entries).toHaveLength(2);
            expect(response.body.total).toBe(2);
            expect(mockRanking.getLeaderboard).toHaveBeenCalledWith(20, 0);
        });

        it('honours custom limit and offset query params', async () => {
            vi.spyOn(mockRanking, 'getLeaderboard').mockResolvedValue({
                total: 0, limit: 5, offset: 10, entries: [],
            });

            await request(app).get('/api/game/rankings?limit=5&offset=10');

            expect(mockRanking.getLeaderboard).toHaveBeenCalledWith(5, 10);
        });

        it('rejects a non-positive limit', async () => {
            const response = await request(app).get('/api/game/rankings?limit=0');

            expect(response.status).toBe(400);
            expect(mockRanking.getLeaderboard).not.toHaveBeenCalled();
        });

        it('rejects a limit above 100', async () => {
            const response = await request(app).get('/api/game/rankings?limit=101');

            expect(response.status).toBe(400);
        });

        it('rejects a negative offset', async () => {
            const response = await request(app).get('/api/game/rankings?offset=-1');

            expect(response.status).toBe(400);
        });

        it('responds 503 when the ranking service is not wired', async () => {
            const bare = buildApp(undefined);

            const response = await request(bare).get('/api/game/rankings');

            expect(response.status).toBe(503);
        });
    });

    describe('GET /api/game/rankings/:userId', () => {
        it('returns the ranking row for the requested user', async () => {
            vi.spyOn(mockRanking, 'getUserRanking').mockResolvedValue({
                rank: 3, userId: 5, username: 'alice', eloRating: 1250, gamesPlayed: 7, peakRating: 1260, lastUpdated: 'now',
            });

            const response = await request(app).get('/api/game/rankings/5');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(
                expect.objectContaining({ userId: 5, rank: 3, eloRating: 1250 }),
            );
            expect(mockRanking.getUserRanking).toHaveBeenCalledWith(5);
        });

        it('returns 404 when the user has no ranking row yet', async () => {
            vi.spyOn(mockRanking, 'getUserRanking').mockResolvedValue(null);

            const response = await request(app).get('/api/game/rankings/99');

            expect(response.status).toBe(404);
        });

        it('validates the userId parameter', async () => {
            const response = await request(app).get('/api/game/rankings/abc');

            expect(response.status).toBe(400);
            expect(mockRanking.getUserRanking).not.toHaveBeenCalled();
        });
    });
});
