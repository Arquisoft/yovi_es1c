import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyJwtMiddleware } from '../src/middleware/verify-jwt';

describe('verifyJwtMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.AUTH_SERVICE_URL = 'http://auth.local';
  });

  it('returns 401 INVALID_TOKEN when token is invalid', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
        new Response(JSON.stringify({ valid: false }), { status: 401 }),
    );

    const app = express();
    app.get('/secure', verifyJwtMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get('/secure').set('Authorization', 'Bearer bad-token');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 UNAUTHORIZED when authorization header is missing', async () => {
    const app = express();
    app.get('/secure', verifyJwtMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get('/secure');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 503 AUTH_UNAVAILABLE when AUTH_SERVICE_URL is missing', async () => {
    delete process.env.AUTH_SERVICE_URL;

    const app = express();
    app.get('/secure', verifyJwtMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get('/secure').set('Authorization', 'Bearer token');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('AUTH_UNAVAILABLE');
  });

  it('allows request when auth service validates token', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
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

  it('returns 503 AUTH_UNAVAILABLE when auth verify times out', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const app = express();
    app.get('/secure', verifyJwtMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get('/secure').set('Authorization', 'Bearer token-timeout');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('AUTH_UNAVAILABLE');
    expect(response.body.details.reason).toBe('AUTH_TIMEOUT');
  });

  it('returns 503 AUTH_UNAVAILABLE when auth service responds 5xx', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
        new Response(JSON.stringify({ error: 'down' }), { status: 503 }),
    );

    const app = express();
    app.get('/secure', verifyJwtMiddleware, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const response = await request(app).get('/secure').set('Authorization', 'Bearer token-down');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('AUTH_UNAVAILABLE');
    expect(response.body.details.reason).toBe('AUTH_UNAVAILABLE');
  });
});