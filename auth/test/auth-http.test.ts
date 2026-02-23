import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret';
process.env.AUTH_DB_PATH = '/tmp/asw-auth-http.db';

let request: any;

beforeAll(async () => {
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

        const first = await request
            .post('/api/auth/register')
            .send({ username, password });

        expect(first.status).toBe(201);

        const duplicate = await request
            .post('/api/auth/register')
            .send({ username, password });

        expect(duplicate.status).toBe(409);
        expect(duplicate.body.error).toBe('user_already_exists');
    });

    it('returns access and refresh token on register', async () => {
        const username = `session-${Date.now()}`;
        const password = 'password123';

        const response = await request
            .post('/api/auth/register')
            .send({ username, password });

        expect(response.status).toBe(201);
        expect(response.body.accessToken).toBeTypeOf('string');
        expect(response.body.refreshToken).toBeTypeOf('string');
        expect(response.body.user.username).toBe(username);

        const decoded = jwt.decode(response.body.accessToken) as jwt.JwtPayload;
        expect(decoded.tokenType).toBe('access');
    });

    it('rotates refresh token on refresh', async () => {
        const username = `rotate-${Date.now()}`;
        const password = 'password123';

        const register = await request
            .post('/api/auth/register')
            .send({ username, password });

        const refresh1 = register.body.refreshToken;

        const refreshed = await request
            .post('/api/auth/refresh')
            .send({ refreshToken: refresh1 });

        expect(refreshed.status).toBe(200);
        expect(refreshed.body.accessToken).toBeTypeOf('string');
        expect(refreshed.body.refreshToken).toBeTypeOf('string');
        expect(refreshed.body.refreshToken).not.toBe(refresh1);

        const replay = await request
            .post('/api/auth/refresh')
            .send({ refreshToken: refresh1 });

        expect(replay.status).toBe(401);
        expect(replay.body.error).toBe('invalid_refresh_token');
    });
});
