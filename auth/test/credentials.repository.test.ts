import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CredentialsRepository } from '../src/repositories/credentials.repository.js';

type Row = Record<string, unknown>;
interface FakeQueryResult {
    rows: Row[];
    rowCount: number;
}

const mockRelease = vi.fn();

const { mockQuery, mockConnect } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockConnect: vi.fn(),
}));
vi.mock('pg', async () => {
    class MockPool {
        query = mockQuery;
        connect = mockConnect;
        constructor(_config?: unknown) {}
    }

    return {
        default: { Pool: MockPool },
        Pool: MockPool,
    };
});

function makeClient(queryImpl: (sql: string) => FakeQueryResult | Promise<FakeQueryResult>) {
    const client = {
        query: vi.fn().mockImplementation((sql: string) => Promise.resolve(queryImpl(sql))),
        release: mockRelease,
    };
    mockConnect.mockResolvedValue(client);
    return client;
}


describe('CredentialsRepository – happy path', () => {
    let repo: CredentialsRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repo = new CredentialsRepository();
    });

    it('createUser returns the id from RETURNING clause', async () => {
        mockQuery.mockResolvedValue({ rows: [{ id: 42 }], rowCount: 1 });
        const id = await repo.createUser('alice', 'hash1');
        expect(id).toBe(42);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO users_credentials'),
            ['alice', 'hash1']
        );
    });

    it('findUserByUsername returns the user row', async () => {
        mockQuery.mockResolvedValue({
            rows: [{ id: 1, username: 'alice', password_hash: 'hash1' }],
            rowCount: 1,
        });
        const user = await repo.findUserByUsername('alice');
        expect(user).not.toBeNull();
        expect(user!.username).toBe('alice');
    });

    it('findUserByUsername returns null when not found', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        const user = await repo.findUserByUsername('nobody');
        expect(user).toBeNull();
    });

    it('findUserById returns the user row', async () => {
        mockQuery.mockResolvedValue({
            rows: [{ id: 7, username: 'bob' }],
            rowCount: 1,
        });
        const user = await repo.findUserById(7);
        expect(user).not.toBeNull();
        expect(user!.id).toBe(7);
    });

    it('findUserById returns null when not found', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        const user = await repo.findUserById(9999);
        expect(user).toBeNull();
    });

    it('createSession resolves without error', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
        await expect(repo.createSession('sess-1', 1, 'dev-1', 'My Phone')).resolves.toBeUndefined();
    });

    it('countActiveSessions returns the count', async () => {
        mockQuery.mockResolvedValue({ rows: [{ total: '3' }], rowCount: 1 });
        const count = await repo.countActiveSessions(1);
        expect(count).toBe(3);
    });

    it('countActiveSessions returns 0 when no rows', async () => {
        mockQuery.mockResolvedValue({ rows: [{ total: null }], rowCount: 1 });
        const count = await repo.countActiveSessions(99);
        expect(count).toBe(0);
    });

    it('storeRefreshToken resolves without error', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
        await expect(
            repo.storeRefreshToken(1, 'sess-1', 'hash-abc', 'fam-1', new Date().toISOString())
        ).resolves.toBeUndefined();
    });

    it('findRefreshTokenByHash returns the token record', async () => {
        const record = {
            id: 5,
            user_id: 1,
            session_id: 'sess-1',
            token_hash: 'hash-abc',
            family_id: 'fam-1',
            expires_at: new Date().toISOString(),
            revoked_at: null,
        };
        mockQuery.mockResolvedValue({ rows: [record], rowCount: 1 });
        const result = await repo.findRefreshTokenByHash('hash-abc');
        expect(result).toEqual(record);
    });

    it('findRefreshTokenByHash returns null when not found', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        const result = await repo.findRefreshTokenByHash('nonexistent');
        expect(result).toBeNull();
    });

    it('revokeRefreshToken returns rowCount', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
        const changes = await repo.revokeRefreshToken(5);
        expect(changes).toBe(1);
    });

    it('revokeRefreshToken returns 0 for already-revoked token', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        const changes = await repo.revokeRefreshToken(5);
        expect(changes).toBe(0);
    });

    it('revokeRefreshTokenFamily returns rowCount', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 2 });
        const changes = await repo.revokeRefreshTokenFamily('fam-1');
        expect(changes).toBe(2);
    });

    it('revokeRefreshTokenFamily returns 0 for unknown family', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        const changes = await repo.revokeRefreshTokenFamily('unknown-family');
        expect(changes).toBe(0);
    });

    it('revokeAllUserSessions commits transaction and returns rowCount', async () => {
        const client = makeClient(() => ({ rows: [], rowCount: 1 }));
        const changes = await repo.revokeAllUserSessions(1);
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(mockRelease).toHaveBeenCalled();
        expect(changes).toBe(1);
    });

    it('revokeSessionById commits transaction and returns rowCount', async () => {
        const client = makeClient(() => ({ rows: [], rowCount: 1 }));
        const changes = await repo.revokeSessionById('sess-1');
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(mockRelease).toHaveBeenCalled();
        expect(changes).toBe(1);
    });

    it('revokeOldestActiveSession returns 0 when no active sessions', async () => {
        const client = makeClient((sql) => {
            if (sql.includes('SELECT')) return { rows: [], rowCount: 0 };
            return { rows: [], rowCount: 0 };
        });
        const changes = await repo.revokeOldestActiveSession(1);
        expect(changes).toBe(0);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('revokeOldestActiveSession revokes session and tokens', async () => {
        let callCount = 0;
        const client = makeClient((sql) => {
            callCount++;
            if (sql.includes('SELECT')) return { rows: [{ id: 'sess-old' }], rowCount: 1 };
            return { rows: [], rowCount: 1 };
        });
        const changes = await repo.revokeOldestActiveSession(1);
        expect(changes).toBe(1);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('countActiveRefreshTokens returns count of non-expired non-revoked tokens', async () => {
        mockQuery.mockResolvedValue({ rows: [{ total: '4' }], rowCount: 1 });
        const count = await repo.countActiveRefreshTokens();
        expect(count).toBe(4);
    });
});

// ── Suite: error paths ─────────────────────────────────────────────────────────

describe('CredentialsRepository – DB error paths', () => {
    let repo: CredentialsRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repo = new CredentialsRepository();
    });

    it('createUser rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.createUser('x', 'h')).rejects.toThrow('db error');
    });

    it('findUserByUsername rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.findUserByUsername('x')).rejects.toThrow('db error');
    });

    it('findUserById rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.findUserById(1)).rejects.toThrow('db error');
    });

    it('createSession rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.createSession('s', 1, 'd')).rejects.toThrow('db error');
    });

    it('countActiveSessions rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.countActiveSessions(1)).rejects.toThrow('db error');
    });

    it('storeRefreshToken rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(
            repo.storeRefreshToken(1, 's', 'h', 'f', new Date().toISOString())
        ).rejects.toThrow('db error');
    });

    it('findRefreshTokenByHash rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.findRefreshTokenByHash('h')).rejects.toThrow('db error');
    });

    it('revokeRefreshToken rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.revokeRefreshToken(1)).rejects.toThrow('db error');
    });

    it('revokeRefreshTokenFamily rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.revokeRefreshTokenFamily('f')).rejects.toThrow('db error');
    });

    it('revokeAllUserSessions rolls back and rethrows on DB error', async () => {
        const client = {
            query: vi.fn()
                .mockResolvedValueOnce(undefined)           // BEGIN
                .mockRejectedValueOnce(new Error('db error')), // UPDATE sessions
            release: mockRelease,
        };
        mockConnect.mockResolvedValue(client);
        await expect(repo.revokeAllUserSessions(1)).rejects.toThrow('db error');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('revokeSessionById rolls back and rethrows on DB error', async () => {
        const client = {
            query: vi.fn()
                .mockResolvedValueOnce(undefined)           // BEGIN
                .mockRejectedValueOnce(new Error('db error')), // UPDATE sessions
            release: mockRelease,
        };
        mockConnect.mockResolvedValue(client);
        await expect(repo.revokeSessionById('s')).rejects.toThrow('db error');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('revokeOldestActiveSession rolls back and rethrows on DB error', async () => {
        const client = {
            query: vi.fn()
                .mockResolvedValueOnce(undefined)           // BEGIN
                .mockRejectedValueOnce(new Error('db error')), // SELECT
            release: mockRelease,
        };
        mockConnect.mockResolvedValue(client);
        await expect(repo.revokeOldestActiveSession(1)).rejects.toThrow('db error');
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockRelease).toHaveBeenCalled();
    });

    it('countActiveRefreshTokens rejects on DB error', async () => {
        mockQuery.mockRejectedValue(new Error('db error'));
        await expect(repo.countActiveRefreshTokens()).rejects.toThrow('db error');
    });
});