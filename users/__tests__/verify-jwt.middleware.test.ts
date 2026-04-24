import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyJwtMiddleware } from '../src/middleware/verify-jwt.js';

describe('users verifyJwtMiddleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.AUTH_SERVICE_URL = 'http://auth.local';
    });

    it('returns 401 when authorization header is missing', async () => {
        const app = express();
        app.get('/secure', verifyJwtMiddleware, (_req, res) => {
            res.status(200).json({ ok: true });
        });

        const response = await request(app).get('/secure');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'unauthorized',
            message: 'Missing authorization header',
        });
    });

    it('accepts request when auth service validates the token', async () => {
        vi.spyOn(globalThis, 'fetch' as never).mockResolvedValue(
            new Response(JSON.stringify({ valid: true, claims: { sub: '7', username: 'alice' } }), { status: 200 }),
        );

        const app = express();
        app.get('/secure', verifyJwtMiddleware, (req, res) => {
            res.status(200).json({ userId: (req as any).userId, username: (req as any).username });
        });

        const response = await request(app).get('/secure').set('Authorization', 'Bearer good-token');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ userId: '7', username: 'alice' });
    });

    it('returns 503 when auth verify times out', async () => {
        vi.spyOn(globalThis, 'fetch' as never).mockRejectedValue(new DOMException('Aborted', 'AbortError'));

        const app = express();
        app.get('/secure', verifyJwtMiddleware, (_req, res) => {
            res.status(200).json({ ok: true });
        });

        const response = await request(app).get('/secure').set('Authorization', 'Bearer timeout-token');

        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            error: 'auth_unavailable',
            message: 'Authentication service unavailable',
            reason: 'AUTH_TIMEOUT',
        });
    });
});
