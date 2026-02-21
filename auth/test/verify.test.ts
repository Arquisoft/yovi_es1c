import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/index.js';
import supertest from 'supertest';

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
        expect(res.body.error).toBe('Missing or invalid Authorization header');
    });

    it('should return 401 with invalid token', async () => {
        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', 'Bearer invalid.token.here');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should return 500 without JWT_SECRET', async () => {
        delete process.env.JWT_SECRET;

        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', 'Bearer anytoken');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('JWT_SECRET not configured');
    });

    it('should verify valid token', async () => {
        const jwt = await import('jsonwebtoken');
        const token = jwt.sign(
            { userId: '123', username: 'david' },
            'test-secret'
        );

        const res = await request
            .post('/api/auth/verify')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.userId).toBe('123');
        expect(res.body.username).toBe('david');
    });
});
