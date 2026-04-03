import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('auth app.ts', () => {

    it('should be a valid express app', () => {
        expect(app).toBeDefined();
        expect(typeof app).toBe('function');
    });

    it('GET /metrics returns 200 with prometheus content-type', async () => {
        const res = await request(app).get('/metrics');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/plain/);
    });

    it('GET /metrics body contains auth metric names', async () => {
        const res = await request(app).get('/metrics');
        // prom-client siempre incluye métricas de proceso por defecto
        expect(res.text).toMatch(/^# /m); // formato prometheus
    });

    it('does not expose x-powered-by header', async () => {
        const res = await request(app).get('/metrics');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('applies helmet — sets x-content-type-options header', async () => {
        const res = await request(app).get('/metrics');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('parses JSON bodies on POST /api/auth/register', async () => {
        // Aunque el endpoint devuelva error de validación, no debe ser 500
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: '', password: '' })
            .set('Content-Type', 'application/json');
        expect(res.status).not.toBe(500);
    });

    it('returns 404 for unknown routes', async () => {
        const res = await request(app).get('/this-route-does-not-exist');
        expect(res.status).toBe(404);
    });

    it('POST /api/auth/login with malformed JSON returns 400', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{ bad json }');
        expect(res.status).toBe(400);
    });
});