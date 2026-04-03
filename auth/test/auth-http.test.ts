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
        expect(refreshA.body.error).toBe('invalid_refresh_token');
        expect(refreshB.status).toBe(200);
    });

    it('logout and logout-all endpoints are idempotent', async () => {
        const username = `logout-${Date.now()}`;
        const password = 'password123';
        const login = await request.post('/api/auth/register').send({ username, password, deviceId: 'A' });

        const one = await request
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${login.body.accessToken}`)
            .send({});
        const two = await request
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${login.body.accessToken}`)
            .send({});

        expect(one.status).toBe(204);
        expect(two.status).toBe(204);

        const allOne = await request
            .post('/api/auth/logout-all')
            .set('Authorization', `Bearer ${login.body.accessToken}`)
            .send({});
        const allTwo = await request
            .post('/api/auth/logout-all')
            .set('Authorization', `Bearer ${login.body.accessToken}`)
            .send({});

        expect(allOne.status).toBe(204);
        expect(allTwo.status).toBe(204);
    });

    it('keeps at most 3 active sessions per user', async () => {
        const username = `limit-${Date.now()}`;
        const password = 'password123';
        await request.post('/api/auth/register').send({ username, password, deviceId: 'D0' });

        const sessions = [];
        for (const device of ['D1', 'D2', 'D3', 'D4']) {
            const login = await request.post('/api/auth/login').send({ username, password, deviceId: device });
            expect(login.status).toBe(200);
            sessions.push(login.body);
        }

        const refreshOldest = await request.post('/api/auth/refresh').send({ refreshToken: sessions[0].refreshToken });
        const refreshLatest = await request.post('/api/auth/refresh').send({ refreshToken: sessions[3].refreshToken });

        expect(refreshOldest.status).toBe(401);
        expect(refreshLatest.status).toBe(200);
    });
});
