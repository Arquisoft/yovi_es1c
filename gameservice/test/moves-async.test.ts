import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameController } from '../src/controllers/GameController';
import { MatchService } from '../src/services/MatchService';
import { errorHandler } from '../src/middleware/error-handler';

class InMemoryMatchRepo {
    private readonly matches = new Map<number, any>();
    private readonly moves = new Map<number, any[]>();

    constructor() {
        this.matches.set(1, { id: 1, user_id: 1, board_size: 3, status: 'ONGOING', difficulty: 'easy' });
        this.moves.set(1, []);
    }

    async createMatch() { return 1; }
    async getMatchById(id: number) { return this.matches.get(id) ?? null; }
    async listMoves(matchId: number) { return [...(this.moves.get(matchId) ?? [])]; }
    async addMove(matchId: number, position: string, player: string, moveNumber: number) {
        const list = this.moves.get(matchId) ?? [];
        list.push({ position_yen: position, player, move_number: moveNumber });
        this.moves.set(matchId, list);
    }
    async finishMatch() {}
}

describe('async bot move flow', () => {
    let app: express.Express;
    let matchService: MatchService;
    const afterUserOpening = 'B/../...';
    const afterBotReply = 'B/R./...';

    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.GAMEY_SERVICE_URL = 'http://gamey';
        matchService = new MatchService(new InMemoryMatchRepo() as any);

        app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            (req as any).userId = 1;
            next();
        });
        app.use('/api/game', createGameController(matchService, { getFullStats: vi.fn() } as any));
        app.use(errorHandler);
    });

    it('returns 202 immediately when bot computation is delayed', async () => {
        vi.spyOn(globalThis, 'fetch' as any).mockImplementation(
            async (..._args: any[]) =>
                new Promise((resolve) => setTimeout(
                    () => resolve({
                        ok: true,
                        json: async () => ({
                            position: {
                                size: 3,
                                turn: 0,
                                players: ['B', 'R'],
                                layout: afterBotReply,
                            },
                        }),
                    } as Response),
                    900,
                )),
        );

        const start = Date.now();
        const response = await request(app).post('/api/game/matches/1/moves').send({
            position_yen: afterUserOpening,
            player: 'USER',
            moveNumber: 1,
        });
        const elapsed = Date.now() - start;

        expect(response.status).toBe(202);
        expect(response.body).toEqual({ status: 'processing', matchId: 1 });
        expect(elapsed).toBeLessThan(500);
    });

    it('updates match after async bot move and reports botStatus done', async () => {
        vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
            ok: true,
            json: async () => ({
                position: {
                    size: 3,
                    turn: 0,
                    players: ['B', 'R'],
                    layout: afterBotReply,
                },
            }),
        } as Response);

        await request(app).post('/api/game/matches/1/moves').send({
            position_yen: afterUserOpening,
            player: 'USER',
            moveNumber: 1,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        const matchResponse = await request(app).get('/api/game/matches/1');
        expect(matchResponse.status).toBe(200);
        expect(matchResponse.body.botStatus).toBe('done');
        expect(matchResponse.body.moves).toEqual([
            expect.objectContaining({ position_yen: afterUserOpening, player: 'USER' }),
            expect.objectContaining({ position_yen: afterBotReply, player: 'BOT' }),
        ]);
        expect(matchResponse.body.layout).toBe(afterBotReply);
    });
});
