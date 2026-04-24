import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUsersRouter } from '../src/routes/users.routes.js';
import { UsersController } from '../src/controllers/users.controller.js';

describe('users routes authentication', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.AUTH_SERVICE_URL = 'http://auth.local';
    });

    it('protects profile routes with JWT verification', async () => {
        const controller = {
            createProfile: vi.fn(async (_req, res) => res.status(201).json({ ok: true })),
            getProfileByUsername: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
            getProfile: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
            updateProfile: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
        } as unknown as UsersController;

        const app = express();
        app.use(express.json());
        app.use('/api/users', createUsersRouter(controller));

        const response = await request(app).get('/api/users/profiles/1');

        expect(response.status).toBe(401);
        expect(controller.getProfile).not.toHaveBeenCalled();
    });
});
