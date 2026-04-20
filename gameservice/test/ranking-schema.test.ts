import { beforeAll, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn().mockResolvedValue({ rows: [] });

vi.mock('pg', () => ({
    Pool: vi.fn(function PoolMock() {
        return { query: queryMock };
    }),
}));

describe('ranking schema migration', () => {
    let ddl: string;

    beforeAll(async () => {
        const { initDB } = await import('../src/database/database');
        await initDB();
        ddl = queryMock.mock.calls[0][0] as string;
    });

    const hasStatement = (...keywords: string[]) =>
        new RegExp(keywords.join('[\\s\\S]*'), 'i').test(ddl);

    it('creates player_rankings with default ELO rating 1200', () => {
        expect(hasStatement('create table', 'player_rankings', 'elo_rating', 'default 1200')).toBe(true);
        expect(hasStatement('create table', 'player_rankings', 'peak_rating', 'default 1200')).toBe(true);
        expect(hasStatement('create table', 'player_rankings', 'user_id', 'primary key')).toBe(true);
    });

    it('creates the ranking_history audit table linked to matches', () => {
        expect(
            hasStatement('create table', 'ranking_history', 'rating_before', 'rating_after', 'delta'),
        ).toBe(true);
        expect(hasStatement('match_id', 'references matches\\(id\\)', 'on delete cascade')).toBe(true);
    });

    it('creates the leaderboard index ordered by elo_rating desc', () => {
        expect(hasStatement('create index', 'idx_rankings_elo', 'elo_rating desc')).toBe(true);
    });

    it('creates lookup indexes for rankings and history', () => {
        expect(hasStatement('create index', 'idx_rankings_user_id')).toBe(true);
        expect(hasStatement('create index', 'idx_history_user_id')).toBe(true);
        expect(hasStatement('create index', 'idx_history_match_id')).toBe(true);
    });

    it('backfills player_rankings from existing matches idempotently', () => {
        expect(
            hasStatement('insert into player_rankings', 'from matches', 'on conflict', 'do nothing'),
        ).toBe(true);
    });
});
