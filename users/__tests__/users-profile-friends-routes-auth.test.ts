import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUsersRouter } from '../src/routes/users.routes.js';
import { UsersController } from '../src/controllers/users.controller.js';

describe('users routes auth for profile and friends', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.AUTH_SERVICE_URL = 'http://auth.local';
  });

  it('protects /me and /friends routes with JWT verification', async () => {
    const controller = {
      createProfile: vi.fn(async (_req, res) => res.status(201).json({ ok: true })),
      getProfileByUsername: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      getProfile: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      updateProfile: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      getMyProfile: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      updateMyProfile: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      listMyFriends: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      listMyFriendRequests: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      sendFriendRequest: vi.fn(async (_req, res) => res.status(201).json({ ok: true })),
      acceptFriendRequest: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      deleteFriendRequest: vi.fn(async (_req, res) => res.status(204).send()),
    } as unknown as UsersController;

    const app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(controller));

    const responses = await Promise.all([
      request(app).get('/api/users/me'),
      request(app).put('/api/users/me').send({ displayName: 'Alex' }),
      request(app).get('/api/users/friends'),
      request(app).get('/api/users/friends/requests'),
      request(app).post('/api/users/friends/requests').send({ username: 'bea' }),
      request(app).post('/api/users/friends/requests/1/accept'),
      request(app).delete('/api/users/friends/requests/1'),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
    }

    expect(controller.getMyProfile).not.toHaveBeenCalled();
    expect(controller.updateMyProfile).not.toHaveBeenCalled();
    expect(controller.listMyFriends).not.toHaveBeenCalled();
    expect(controller.listMyFriendRequests).not.toHaveBeenCalled();
    expect(controller.sendFriendRequest).not.toHaveBeenCalled();
    expect(controller.acceptFriendRequest).not.toHaveBeenCalled();
    expect(controller.deleteFriendRequest).not.toHaveBeenCalled();
  });
});
