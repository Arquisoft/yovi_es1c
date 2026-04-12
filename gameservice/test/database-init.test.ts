import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const readFileSyncMock = vi.fn();
const poolCtorMock = vi.fn(function PoolMock() {
    return { query: queryMock };
});

vi.mock('pg', () => ({
    Pool: poolCtorMock,
}));

vi.mock('fs', () => ({
    default: { readFileSync: readFileSyncMock },
    readFileSync: readFileSyncMock,
}));

describe('initDB', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryMock.mockResolvedValue({ rows: [] });
        readFileSyncMock.mockReturnValue('SELECT 1;');

        delete process.env.PGPOOL_MAX;
        process.env.PGHOST = 'localhost';
        process.env.PGPORT = '5432';
        process.env.PGDATABASE = 'gamedb';
        process.env.PGUSER = 'game_user';
        process.env.PGPASSWORD = 'secret';
    });

    it('uses PGPOOL_MAX env value when present', async () => {
        process.env.PGPOOL_MAX = '50';
        const { initDB } = await import('../src/database/database');

        await initDB();

        expect(poolCtorMock).toHaveBeenCalledWith(expect.objectContaining({ max: 50 }));
    });

    it('falls back to max pool size of 10 when PGPOOL_MAX is missing', async () => {
        const { initDB } = await import('../src/database/database');

        await initDB();

        expect(poolCtorMock).toHaveBeenCalledWith(expect.objectContaining({ max: 10 }));
    });
});