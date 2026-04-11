import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchRepository } from '../src/repositories/MatchRepository';
import type { Pool, QueryResult } from 'pg';

function makePool(rows: unknown[] = []): Pool {
    return {
        query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length } as QueryResult),
    } as unknown as Pool;
}

describe('MatchRepository', () => {
    let pool: Pool;
    let repo: MatchRepository;

    beforeEach(() => {
        pool = makePool();
        repo = new MatchRepository(pool);
    });


    describe('createMatch', () => {
        it('returns the new match id', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: 42 }] });
            const id = await repo.createMatch(1, 9, 'EASY');
            expect(id).toBe(42);
        });

        it('uses BOT as default mode', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: 1 }] });
            await repo.createMatch(1, 9, 'EASY');
            const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(call[1]).toContain('BOT');
        });

        it('accepts a custom mode', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [{ id: 5 }] });
            const id = await repo.createMatch(2, 13, 'HARD', 'HUMAN');
            expect(id).toBe(5);
            const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(call[1]).toContain('HUMAN');
        });

        it('propagates DB errors', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));
            await expect(repo.createMatch(1, 9, 'EASY')).rejects.toThrow('DB error');
        });
    });


    describe('getMatchById', () => {
        it('returns the match when found', async () => {
            const match = { id: 7, user_id: 1, status: 'ONGOING' };
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [match] });
            const result = await repo.getMatchById(7);
            expect(result).toEqual(match);
        });

        it('returns null when not found', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
            const result = await repo.getMatchById(999);
            expect(result).toBeNull();
        });

        it('queries with the correct id parameter', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
            await repo.getMatchById(42);
            expect(pool.query).toHaveBeenCalledWith(expect.any(String), [42]);
        });
    });


    describe('addMove', () => {
        it('executes an INSERT without returning a value', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
            await expect(repo.addMove(1, 'a1', 'USER', 1)).resolves.toBeUndefined();
        });

        it('passes all parameters to the query', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
            await repo.addMove(10, 'b2', 'BOT', 3);
            expect(pool.query).toHaveBeenCalledWith(expect.any(String), [10, 'b2', 'BOT', 3]);
        });

        it('propagates DB errors', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('constraint violation'));
            await expect(repo.addMove(1, 'a1', 'USER', 1)).rejects.toThrow('constraint violation');
        });
    });


    describe('listMoves', () => {
        it('returns all moves for a match', async () => {
            const moves = [
                { id: 1, match_id: 5, position_yen: 'a1', player: 'USER', move_number: 1, timestamp: null },
                { id: 2, match_id: 5, position_yen: 'b2', player: 'BOT',  move_number: 2, timestamp: null },
            ];
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: moves });
            const result = await repo.listMoves(5);
            expect(result).toEqual(moves);
            expect(result).toHaveLength(2);
        });

        it('returns an empty array when there are no moves', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
            const result = await repo.listMoves(999);
            expect(result).toEqual([]);
        });

        it('queries with the correct matchId', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
            await repo.listMoves(7);
            expect(pool.query).toHaveBeenCalledWith(expect.any(String), [7]);
        });

        it('propagates DB errors', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('connection lost'));
            await expect(repo.listMoves(1)).rejects.toThrow('connection lost');
        });
    });


    describe('finishMatch', () => {
        it('executes an UPDATE without returning a value', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
            await expect(repo.finishMatch(1, 'USER')).resolves.toBeUndefined();
        });

        it('passes winner and matchId in the correct order', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });
            await repo.finishMatch(3, 'BOT');
            expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['BOT', 3]);
        });

        it('propagates DB errors', async () => {
            (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));
            await expect(repo.finishMatch(1, 'USER')).rejects.toThrow('timeout');
        });
    });


    it('exposes db as readonly (TypeScript-enforced, pool instance is stable)', () => {
        const pool2 = makePool();
        const repo2 = new MatchRepository(pool2);
        (pool2.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [{ id: 1 }] });
        expect(() => repo2.createMatch(1, 9, 'EASY')).not.toThrow();
    });
});