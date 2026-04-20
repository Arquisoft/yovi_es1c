import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { RankingRepository } from '../src/repositories/RankingRepository';

describe('RankingRepository', () => {
    let pool: Pool;
    let repo: RankingRepository;
    let client: PoolClient;

    beforeEach(() => {
        client = {
            query: vi.fn().mockResolvedValue({ rows: [] }),
            release: vi.fn(),
        } as unknown as PoolClient;

        pool = {
            query: vi.fn(),
            connect: vi.fn().mockResolvedValue(client),
        } as unknown as Pool;

        repo = new RankingRepository(pool);
    });

    describe('getByUserId', () => {
        it('returns the stored row when the user exists', async () => {
            vi.mocked(pool.query).mockResolvedValueOnce({
                rows: [{
                    user_id: 1,
                    username: 'alice',
                    elo_rating: 1400,
                    games_played: 12,
                    peak_rating: 1500,
                    last_updated: '2026-04-01T00:00:00Z',
                }],
            } as never);

            const row = await repo.getByUserId(1);

            expect(row?.elo_rating).toBe(1400);
            expect(row?.username).toBe('alice');
            expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM player_rankings'), [1]);
        });

        it('returns null when the user has no ranking row', async () => {
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

            await expect(repo.getByUserId(99)).resolves.toBeNull();
        });
    });

    describe('getLeaderboard', () => {
        it('maps rows to LeaderboardEntry shape and forwards limit/offset', async () => {
            vi.mocked(pool.query).mockResolvedValueOnce({
                rows: [
                    { user_id: 1, username: 'alice', elo_rating: 1500, games_played: 10, peak_rating: 1500, last_updated: 'now', rank: '1' },
                    { user_id: 2, username: null, elo_rating: 1400, games_played: 4, peak_rating: 1420, last_updated: 'now', rank: '2' },
                ],
            } as never);

            const entries = await repo.getLeaderboard(10, 0);

            expect(entries).toHaveLength(2);
            expect(entries[0]).toEqual({
                rank: 1, userId: 1, username: 'alice', eloRating: 1500, gamesPlayed: 10, peakRating: 1500, lastUpdated: 'now',
            });
            expect(entries[1].username).toBeNull();
            expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1 OFFSET $2'), [10, 0]);
        });

        it('returns an empty array when there are no players', async () => {
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

            await expect(repo.getLeaderboard(10, 0)).resolves.toEqual([]);
        });
    });

    describe('getTotalRankedPlayers', () => {
        it('returns the numeric count', async () => {
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ count: '42' }] } as never);

            await expect(repo.getTotalRankedPlayers()).resolves.toBe(42);
        });

        it('returns 0 when no rows are returned', async () => {
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

            await expect(repo.getTotalRankedPlayers()).resolves.toBe(0);
        });
    });

    describe('getUserRanking', () => {
        it('maps the ranked row to UserRankingDto shape', async () => {
            vi.mocked(pool.query).mockResolvedValueOnce({
                rows: [{ user_id: 5, username: 'bob', elo_rating: 1350, games_played: 8, peak_rating: 1360, last_updated: 'now', rank: '3' }],
            } as never);

            const row = await repo.getUserRanking(5);

            expect(row).toEqual({
                rank: 3, userId: 5, username: 'bob', eloRating: 1350, gamesPlayed: 8, peakRating: 1360, lastUpdated: 'now',
            });
        });

        it('returns null when the user has no ranking row', async () => {
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as never);

            await expect(repo.getUserRanking(999)).resolves.toBeNull();
        });
    });

    describe('applyRatingChange', () => {
        it('executes BEGIN, UPSERT, history insert and COMMIT inside a transaction', async () => {
            await repo.applyRatingChange({
                userId: 1,
                username: 'alice',
                matchId: 10,
                ratingBefore: 1200,
                ratingAfter: 1216,
                delta: 16,
                gamesPlayedAfter: 6,
                peakRating: 1216,
            });

            const calls = vi.mocked(client.query).mock.calls.map((c) => c[0] as string);
            expect(calls[0]).toBe('BEGIN');
            expect(calls[1]).toContain('INSERT INTO player_rankings');
            expect(calls[2]).toContain('INSERT INTO ranking_history');
            expect(calls[3]).toBe('COMMIT');
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it('passes username to the UPSERT parameters', async () => {
            await repo.applyRatingChange({
                userId: 1,
                username: 'alice',
                matchId: 10,
                ratingBefore: 1200,
                ratingAfter: 1220,
                delta: 20,
                gamesPlayedAfter: 6,
                peakRating: 1220,
            });

            const upsertCall = vi.mocked(client.query).mock.calls.find(
                (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO player_rankings'),
            );
            expect(upsertCall?.[1]).toEqual([1, 'alice', 1220, 6, 1220]);
        });

        it('defaults username to null when not supplied', async () => {
            await repo.applyRatingChange({
                userId: 1,
                matchId: 10,
                ratingBefore: 1200,
                ratingAfter: 1220,
                delta: 20,
                gamesPlayedAfter: 6,
                peakRating: 1220,
            });

            const upsertCall = vi.mocked(client.query).mock.calls.find(
                (c) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO player_rankings'),
            );
            expect(upsertCall?.[1]?.[1]).toBeNull();
        });

        it('rolls back and rethrows when the transaction fails', async () => {
            const dbError = new Error('insert failed');
            vi.mocked(client.query).mockImplementation(async (query: any) => {
                if (typeof query === 'string' && query.includes('INSERT INTO ranking_history')) {
                    throw dbError;
                }
                return { rows: [] } as never;
            });

            await expect(
                repo.applyRatingChange({
                    userId: 1,
                    matchId: 10,
                    ratingBefore: 1200,
                    ratingAfter: 1220,
                    delta: 20,
                    gamesPlayedAfter: 6,
                    peakRating: 1220,
                }),
            ).rejects.toThrow('insert failed');

            const calls = vi.mocked(client.query).mock.calls.map((c) => c[0] as string);
            expect(calls).toContain('ROLLBACK');
            expect(client.release).toHaveBeenCalledTimes(1);
        });
    });
});
