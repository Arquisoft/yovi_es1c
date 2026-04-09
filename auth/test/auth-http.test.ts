import { describe, it, expect, beforeAll, vi } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';

interface UserRow    { id: number; username: string; password_hash: string }
interface SessionRow { id: string; user_id: number; device_id: string; device_name?: string | undefined; created_at: Date; revoked_at: Date | null }
interface TokenRow   { id: number; user_id: number; session_id: string; token_hash: string; family_id: string; expires_at: string; revoked_at: string | null; created_at: Date }

let users:    UserRow[]    = [];
let sessions: SessionRow[] = [];
let tokens:   TokenRow[]   = [];
let userSeq   = 0;
let tokenSeq  = 0;

function resetStore() {
    users = []; sessions = []; tokens = []; userSeq = 0; tokenSeq = 0;
}

function runSql(sql: string, params?: unknown[]): { rows: unknown[]; rowCount: number } {
    const s = sql.trim();

    if (/CREATE TABLE|CREATE INDEX/i.test(s)) {
        return { rows: [], rowCount: 0 };
    }

    if (/INSERT INTO users_credentials/i.test(s)) {
        const [username, password_hash] = params as [string, string];
        if (users.find(u => u.username === username)) throw { code: '23505' };
        const id = ++userSeq;
        users.push({ id, username, password_hash });
        return { rows: [{ id }], rowCount: 1 };
    }
    if (/SELECT.*FROM users_credentials WHERE username\s*=/i.test(s)) {
        const row = users.find(u => u.username === params![0]) ?? null;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (/SELECT.*FROM users_credentials WHERE id\s*=/i.test(s)) {
        const row = users.find(u => u.id === params![0]) ?? null;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    // ── sessions ─────────────────────────────────────────────────────────────
    if (/INSERT INTO sessions/i.test(s)) {
        const [id, user_id, device_id, device_name] = params as [string, number, string, string?];
        sessions.push({ id, user_id, device_id, device_name, created_at: new Date(), revoked_at: null });
        return { rows: [], rowCount: 1 };
    }
    if (/COUNT\(\*\).*FROM sessions WHERE user_id/i.test(s)) {
        const total = sessions.filter(r => r.user_id === params![0] && !r.revoked_at).length;
        return { rows: [{ total: String(total) }], rowCount: 1 };
    }
    // SELECT oldest session (revokeOldestActiveSession)
    if (/SELECT id FROM sessions WHERE user_id.*ORDER BY created_at/is.test(s)) {
        const active = sessions
            .filter(r => r.user_id === params![0] && !r.revoked_at)
            .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
        return { rows: active.length ? [{ id: active[0].id }] : [], rowCount: active.length };
    }
    // UPDATE sessions WHERE user_id  ← ANTES que WHERE id para evitar colisión
    if (/UPDATE sessions SET revoked_at.*WHERE user_id/i.test(s)) {
        let count = 0;
        sessions.filter(r => r.user_id === params![0] && !r.revoked_at)
            .forEach(r => { r.revoked_at = new Date(); count++; });
        return { rows: [], rowCount: count };
    }
    // UPDATE sessions WHERE id (revokeOldestActiveSession inner + revokeSessionById)
    if (/UPDATE sessions SET revoked_at.*WHERE id/i.test(s)) {
        const row = sessions.find(r => r.id === params![0] && !r.revoked_at);
        if (row) row.revoked_at = new Date();
        return { rows: [], rowCount: row ? 1 : 0 };
    }

    // ── refresh_tokens ───────────────────────────────────────────────────────
    if (/INSERT INTO refresh_tokens/i.test(s)) {
        const [user_id, session_id, token_hash, family_id, expires_at] = params as [number, string, string, string, string];
        tokens.push({ id: ++tokenSeq, user_id, session_id, token_hash, family_id, expires_at, revoked_at: null, created_at: new Date() });
        return { rows: [], rowCount: 1 };
    }
    if (/SELECT.*FROM refresh_tokens WHERE token_hash/i.test(s)) {
        const row = tokens.find(t => t.token_hash === params![0]) ?? null;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    // UPDATE refresh_tokens WHERE user_id  ← ANTES que WHERE id/session_id
    if (/UPDATE refresh_tokens SET revoked_at.*WHERE user_id/i.test(s)) {
        let count = 0;
        tokens.filter(t => t.user_id === params![0] && !t.revoked_at)
            .forEach(t => { t.revoked_at = new Date().toISOString(); count++; });
        return { rows: [], rowCount: count };
    }
    // UPDATE refresh_tokens WHERE family_id
    if (/UPDATE refresh_tokens SET revoked_at.*WHERE family_id/i.test(s)) {
        let count = 0;
        tokens.filter(t => t.family_id === params![0] && !t.revoked_at)
            .forEach(t => { t.revoked_at = new Date().toISOString(); count++; });
        return { rows: [], rowCount: count };
    }
    // UPDATE refresh_tokens WHERE session_id
    if (/UPDATE refresh_tokens SET revoked_at.*WHERE session_id/i.test(s)) {
        let count = 0;
        tokens.filter(t => t.session_id === params![0] && !t.revoked_at)
            .forEach(t => { t.revoked_at = new Date().toISOString(); count++; });
        return { rows: [], rowCount: count };
    }
    // UPDATE refresh_tokens WHERE id  ← AL FINAL, el más específico corto
    if (/UPDATE refresh_tokens SET revoked_at.*WHERE id/i.test(s)) {
        const row = tokens.find(t => t.id === params![0] && !t.revoked_at);
        if (row) row.revoked_at = new Date().toISOString();
        return { rows: [], rowCount: row ? 1 : 0 };
    }
    // COUNT active tokens (métrica)
    if (/COUNT\(\*\).*FROM refresh_tokens/i.test(s)) {
        const total = tokens.filter(t => !t.revoked_at && new Date(t.expires_at) > new Date()).length;
        return { rows: [{ total: String(total) }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
}



vi.mock('pg', async () => {
    class MockClient {
        private txBuffer: (() => void)[] = [];
        async connect() { return undefined; }
        async end()     { return undefined; }
        async query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }> {
            return runSql(sql, params);
        }
    }

    class MockPool {
        async query(sql: string, params?: unknown[]) { return runSql(sql, params); }
        async connect() {
            const client = {
                query: async (sql: string, params?: unknown[]) => runSql(sql, params),
                release: vi.fn(),
                _tx: [] as string[],
            };
            // sobreescribir query para manejar BEGIN/COMMIT/ROLLBACK
            const origQuery = client.query.bind(client);
            client.query = async (sql: string, params?: unknown[]) => {
                const s = sql.trim().toUpperCase();
                if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
                    return { rows: [], rowCount: 0 };
                }
                return origQuery(sql, params);
            };
            return client;
        }
    }

    return { default: { Pool: MockPool, Client: MockClient } };
});



// ── Tests ─────────────────────────────────────────────────────────────────────

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
    resetStore();
    const { app, ensureInitialized } = await import('../src/index.js');
    await ensureInitialized();
    request = supertest(app);
});

describe('Auth HTTP contracts', () => {
    it('returns 400 invalid_input for invalid register body', async () => {
        const response = await request
            .post('/api/auth/register')
            .send({ username: '', password: '123' });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe('invalid_input');
        expect(Array.isArray(response.body.details)).toBe(true);
    });

    it('returns 401 bad_credentials for invalid login credentials', async () => {
        const response = await request
            .post('/api/auth/login')
            .send({ username: 'non-existing-user', password: 'wrong-pass-123' });
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('bad_credentials');
    });

    it('returns 409 user_already_exists on duplicate register', async () => {
        const username = `user-${Date.now()}`;
        const password = 'password123';
        const first = await request.post('/api/auth/register').send({ username, password });
        expect(first.status).toBe(201);
        const duplicate = await request.post('/api/auth/register').send({ username, password });
        expect(duplicate.status).toBe(409);
        expect(duplicate.body.error).toBe('user_already_exists');
    });

    it('returns access and refresh token on register', async () => {
        const username = `session-${Date.now()}`;
        const response = await request.post('/api/auth/register').send({ username, password: 'password123' });
        expect(response.status).toBe(201);
        expect(response.body.accessToken).toBeTypeOf('string');
        expect(response.body.refreshToken).toBeTypeOf('string');
        expect(response.body.user.username).toBe(username);
        const decoded = jwt.decode(response.body.accessToken) as jwt.JwtPayload;
        expect(decoded.tokenType).toBe('access');
    });

    it('rotates refresh token on refresh', async () => {
        const username = `rotate-${Date.now()}`;
        const register = await request.post('/api/auth/register').send({ username, password: 'password123' });
        const refresh1 = register.body.refreshToken;
        const refreshed = await request.post('/api/auth/refresh').send({ refreshToken: refresh1 });
        expect(refreshed.status).toBe(200);
        expect(refreshed.body.refreshToken).not.toBe(refresh1);
        const replay = await request.post('/api/auth/refresh').send({ refreshToken: refresh1 });
        expect(replay.status).toBe(401);
        expect(replay.body.error).toBe('invalid_refresh_token');
    });

    it('allows login in device A and B, and logout only revokes one session', async () => {
        const username = `devices-${Date.now()}`;
        const password = 'password123';
        await request.post('/api/auth/register').send({ username, password, deviceId: 'A' });
        const loginA = await request.post('/api/auth/login').send({ username, password, deviceId: 'A' });
        const loginB = await request.post('/api/auth/login').send({ username, password, deviceId: 'B' });
        expect(loginA.status).toBe(200);
        expect(loginB.status).toBe(200);
        expect(loginA.body.session.sessionId).not.toBe(loginB.body.session.sessionId);
        const logoutA = await request
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${loginA.body.accessToken}`)
            .send({});
        expect(logoutA.status).toBe(204);
        const refreshA = await request.post('/api/auth/refresh').send({ refreshToken: loginA.body.refreshToken });
        const refreshB = await request.post('/api/auth/refresh').send({ refreshToken: loginB.body.refreshToken });
        expect(refreshA.status).toBe(401);
        expect(refreshB.status).toBe(200);
    });

    it('logout and logout-all endpoints are idempotent', async () => {
        const username = `logout-${Date.now()}`;
        const login = await request.post('/api/auth/register').send({ username, password: 'password123', deviceId: 'A' });
        const token = login.body.accessToken;
        const one = await request.post('/api/auth/logout').set('Authorization', `Bearer ${token}`).send({});
        const two = await request.post('/api/auth/logout').set('Authorization', `Bearer ${token}`).send({});
        expect(one.status).toBe(204);
        expect(two.status).toBe(204);
        const allOne = await request.post('/api/auth/logout-all').set('Authorization', `Bearer ${token}`).send({});
        const allTwo = await request.post('/api/auth/logout-all').set('Authorization', `Bearer ${token}`).send({});
        expect(allOne.status).toBe(204);
        expect(allTwo.status).toBe(204);
    });

    it('keeps at most 3 active sessions per user', async () => {
        const username = `limit-${Date.now()}`;
        await request.post('/api/auth/register').send({ username, password: 'password123', deviceId: 'D0' });
        const sessions = [];
        for (const device of ['D1', 'D2', 'D3', 'D4']) {
            const login = await request.post('/api/auth/login').send({ username, password: 'password123', deviceId: device });
            expect(login.status).toBe(200);
            sessions.push(login.body);
        }
        const refreshOldest = await request.post('/api/auth/refresh').send({ refreshToken: sessions[0].refreshToken });
        const refreshLatest = await request.post('/api/auth/refresh').send({ refreshToken: sessions[3].refreshToken });
        expect(refreshOldest.status).toBe(401);
        expect(refreshLatest.status).toBe(200);
    });
});