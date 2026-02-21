import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { app } from '../src/app.js';

const request = supertest(app);

describe('Auth register/login', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret';
        process.env.AUTH_DB_PATH = ':memory:';
    });

    afterEach(() => {
        delete process.env.JWT_SECRET;
        delete process.env.AUTH_DB_PATH;
    });

    it('register -> 201 returns userId and token', async () => {
        const res = await request
            .post('/api/auth/register')
            .send({ username: 'david', password: 'pass123' });

        expect(res.status).toBe(201);
        expect(typeof res.body.userId).toBe('number');
        expect(typeof res.body.token).toBe('string');
    });

    it('register duplicate -> 409', async () => {
        await request.post('/api/auth/register').send({ username: 'dup', password: 'a' });
        const res = await request.post('/api/auth/register').send({ username: 'dup', password: 'a' });

        expect(res.status).toBe(409);
        expect(res.body).toHaveProperty('error');
    });

    it('login wrong password -> 401', async () => {
        await request.post('/api/auth/register').send({ username: 'u1', password: 'good' });

        const res = await request
            .post('/api/auth/login')
            .send({ username: 'u1', password: 'bad' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error');
    });

    it('login ok -> 200 returns userId and token', async () => {
        await request.post('/api/auth/register').send({ username: 'u2', password: 'good' });

        const res = await request
            .post('/api/auth/login')
            .send({ username: 'u2', password: 'good' });

        expect(res.status).toBe(200);
        expect(typeof res.body.userId).toBe('number');
        expect(typeof res.body.token).toBe('string');
    });
});