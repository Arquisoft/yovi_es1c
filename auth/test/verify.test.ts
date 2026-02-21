import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/app.js';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

const request = supertest(app);

describe('POST /api/auth/verify', () => {
    beforeEach(async () => {
        process.env.JWT_SECRET = 'test-secret';
    });

    afterEach(() => {
        delete process.env.JWT_SECRET;
    });

    it('should return 401 without Authorization header', async () => {
        const res = await request.post('/api/auth/verify');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with invalid token', async () => {
        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', 'Bearer invalid.token.here');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with missing bearer scheme', async () => {
        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', 'Token abc.def.ghi');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with empty bearer token', async () => {
        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', 'Bearer ');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with malformed bearer token', async () => {
        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', 'Bearer  token');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with expired token', async () => {
        const token = jwt.sign(
            { userId: '123', username: 'david' },
            'test-secret',
            { expiresIn: -1, subject: '123', algorithm: 'HS256' }
        );

        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 with tampered token', async () => {
        const token = jwt.sign(
            { userId: '123', username: 'david' },
            'test-secret',
            { expiresIn: '1h', subject: '123', algorithm: 'HS256' }
        );

        const tamperedToken = `${token.slice(0, -1)}x`;

        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', `Bearer ${tamperedToken}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });

    it('should verify valid token', async () => {
        const token = jwt.sign(
            { userId: '123', username: 'david' },
            'test-secret',
            { expiresIn: '1h', subject: '123', algorithm: 'HS256' }
        );

        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.userId).toBe('123');
        expect(res.body).toEqual({ userId: '123' });
    });

    it('should return 401 when token has no sub (subject)', async () => {
        const token = jwt.sign(
            { userId: '123', username: 'david' },
            'test-secret',
            { expiresIn: '1h', algorithm: 'HS256' }
        );

        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 401 when JWT secret is missing', async () => {
        delete process.env.JWT_SECRET;

        const token = jwt.sign(
            { userId: '123', username: 'david' },
            'another-secret',
            { expiresIn: '1h', subject: '123', algorithm: 'HS256' }
        );

        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Unauthorized');
    });
});
