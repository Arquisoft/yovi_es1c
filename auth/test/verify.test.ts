import { describe, it, expect, beforeAll, vi } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';

vi.mock('pg', async () => {
    class MockClient {
        async connect() { return undefined; }
        async end()     { return undefined; }
        async query()   { return { rows: [], rowCount: 0 }; }
    }
    class MockPool {
        async query(sql: string) {
            if (/CREATE TABLE|CREATE INDEX/i.test(sql)) return { rows: [], rowCount: 0 };
            return { rows: [], rowCount: 0 };
        }
        async connect() {
            return {
                query: async (sql: string) => {
                    const s = sql.trim().toUpperCase();
                    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [], rowCount: 0 };
                    return { rows: [], rowCount: 0 };
                },
                release: vi.fn(),
            };
        }
    }
    return { default: { Pool: MockPool, Client: MockClient } };
});

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
    const { app, ensureInitialized } = await import('../src/index.js');
    await ensureInitialized();
    request = supertest(app);
});

describe('POST /api/auth/verify', () => {
    it('should return 401 without Authorization header', async () => {
        const res = await request.post('/api/auth/verify');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ valid: false });
    });

    it('should return 401 with invalid token', async () => {
        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', 'Bearer invalid.token.here');
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ valid: false });
    });

    it('should verify valid access token', async () => {
        const token = jwt.sign(
            { username: 'david', tokenType: 'access' },
            'test-secret',
            { expiresIn: '1h', subject: '123', algorithm: 'HS256' }
        );
        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(true);
        expect(res.body.claims.sub).toBe('123');
        expect(res.body.claims.tokenType).toBe('access');
    });

    it('should verify valid token from body', async () => {
        const token = jwt.sign(
            { username: 'david', tokenType: 'access' },
            'test-secret',
            { expiresIn: '1h', subject: '123', algorithm: 'HS256' }
        );
        const res = await request
            .post('/api/auth/verify')
            .send({ token });
        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(true);
    });

    it('should return 401 for non-access tokens', async () => {
        const token = jwt.sign(
            { username: 'david', tokenType: 'refresh' },
            'test-secret',
            { expiresIn: '1h', subject: '123', algorithm: 'HS256' }
        );
        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ valid: false });
    });
});