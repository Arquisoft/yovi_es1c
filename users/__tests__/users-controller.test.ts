import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { UsersController } from '../src/controllers/users.controller.js';
import { UsersService } from '../src/services/users.service.js';
import { UserRepository } from '../src/repositories/users.repository.js';
import {
  ForbiddenFriendRequestActionError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
  FriendshipNotFoundError,
  ProfileNotFoundError,
  ValidationError,
} from '../src/errors/domain-errors.js';

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
  } as unknown as Response;

  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  (res.json as ReturnType<typeof vi.fn>).mockReturnValue(res);
  (res.send as ReturnType<typeof vi.fn>).mockReturnValue(res);

  return res;
}

function makeReq({
  params = {},
  body = {},
  userId,
  username,
}: {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  userId?: string;
  username?: string;
} = {}): Request {
  return {
    params,
    body,
    userId,
    username,
  } as unknown as Request;
}

describe('UsersController', () => {
  let controller: UsersController;
  let mockService: UsersService;
  let mockRepo: UserRepository;

  const fullProfile = {
    id: 1,
    user_id: 1,
    username: 'alex',
    display_name: 'Alex Visible',
    email: 'alex@yovi.test',
    avatar: '/avatars/avatar01.png',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockService = {
      onUserCreated: vi.fn(),
      onProfileUpdated: vi.fn(),
      onUserDeleted: vi.fn(),
    } as unknown as UsersService;

    mockRepo = {
      createProfile: vi.fn(),
      ensureProfile: vi.fn(),
      getById: vi.fn(),
      getByUsername: vi.fn(),
      updateProfile: vi.fn(),
      listFriends: vi.fn(),
      listPendingFriendRequests: vi.fn(),
      createFriendRequest: vi.fn(),
      acceptFriendRequest: vi.fn(),
      deleteFriendRequest: vi.fn(),
      deleteFriendship: vi.fn(),
      hasFriendship: vi.fn(),
    } as unknown as UserRepository;

    controller = new UsersController(mockService, mockRepo);
  });

  it('delegates metric helpers to usersService', () => {
    controller.recordCreatedUser();
    controller.recordUpdatedProfile();
    controller.recordDeletedUser();

    expect(mockService.onUserCreated).toHaveBeenCalledOnce();
    expect(mockService.onProfileUpdated).toHaveBeenCalledOnce();
    expect(mockService.onUserDeleted).toHaveBeenCalledOnce();
  });

  it('createProfile returns 400 when userId or username is missing', async () => {
    const req = makeReq({ body: { username: 'alex' }, userId: '1' });
    const res = makeRes();

    await controller.createProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'userId and username are required' });
  });

  it('createProfile returns 403 when body userId does not match the token user', async () => {
    const req = makeReq({ body: { userId: 2, username: 'alex' }, userId: '1' });
    const res = makeRes();

    await controller.createProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockRepo.createProfile).not.toHaveBeenCalled();
  });

  it('createProfile returns 201 on success and keeps user_id/id compatibility', async () => {
    vi.mocked(mockRepo.createProfile).mockResolvedValue(fullProfile);

    const req = makeReq({
      body: { userId: 1, username: 'alex', avatar: '/avatars/avatar01.png' },
      userId: '1',
    });
    const res = makeRes();

    await controller.createProfile(req, res);

    expect(mockRepo.createProfile).toHaveBeenCalledWith(1, 'alex', '/avatars/avatar01.png');
    expect(mockService.onUserCreated).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      user_id: 1,
      username: 'alex',
      avatar: '/avatars/avatar01.png',
    }));
  });

  it('createProfile rejects invalid avatars', async () => {
    const req = makeReq({ body: { userId: 1, username: 'alex', avatar: '/bad.png' }, userId: '1' });
    const res = makeRes();

    await controller.createProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockRepo.createProfile).not.toHaveBeenCalled();
  });

  it('getProfile returns 404 when missing', async () => {
    vi.mocked(mockRepo.getById).mockResolvedValue(null);
    const res = makeRes();

    await controller.getProfile(makeReq({ params: { id: '99' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('getProfile returns profile by user_id', async () => {
    vi.mocked(mockRepo.getById).mockResolvedValue(fullProfile);
    const res = makeRes();

    await controller.getProfile(makeReq({ params: { id: '1' } }), res);

    expect(mockRepo.getById).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 1, user_id: 1 }));
  });

  it('getProfileByUsername returns profile on success', async () => {
    vi.mocked(mockRepo.getByUsername).mockResolvedValue(fullProfile);
    const res = makeRes();

    await controller.getProfileByUsername(makeReq({ params: { username: 'alex' } }), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ username: 'alex' }));
  });

  it('getMyProfile ensures a profile when authenticated', async () => {
    vi.mocked(mockRepo.ensureProfile).mockResolvedValue(fullProfile);

    const res = makeRes();
    await controller.getMyProfile(makeReq({ userId: '1', username: 'alex' }), res);

    expect(mockRepo.ensureProfile).toHaveBeenCalledWith(1, 'alex', '/avatars/avatar01.png');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      user_id: 1,
      username: 'alex',
      displayName: 'Alex Visible',
      email: 'alex@yovi.test',
    }));
  });

  it('getMyProfile returns 401 when token claims are incomplete', async () => {
    const res = makeRes();

    await controller.getMyProfile(makeReq({ userId: '1' }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockRepo.ensureProfile).not.toHaveBeenCalled();
  });

  it('updateMyProfile returns updated profile in camelCase', async () => {
    vi.mocked(mockRepo.updateProfile).mockResolvedValue(fullProfile);

    const res = makeRes();
    await controller.updateMyProfile(
      makeReq({
        userId: '1',
        body: { displayName: 'Alex Visible', email: 'alex@yovi.test', avatar: '/avatars/avatar01.png' },
      }),
      res,
    );

    expect(mockRepo.updateProfile).toHaveBeenCalledWith(1, {
      displayName: 'Alex Visible',
      email: 'alex@yovi.test',
      avatar: '/avatars/avatar01.png',
    });
    expect(mockService.onProfileUpdated).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      username: 'alex',
      displayName: 'Alex Visible',
    }));
  });

  it('updateProfile returns 400 for invalid id', async () => {
    const res = makeRes();

    await controller.updateProfile(makeReq({ params: { id: 'abc' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('listMyFriends returns friends payload', async () => {
    vi.mocked(mockRepo.listFriends).mockResolvedValue([
      {
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        avatar: '/avatars/avatar02.png',
        friendship_created_at: '2026-01-02T00:00:00.000Z',
      },
    ]);

    const res = makeRes();
    await controller.listMyFriends(makeReq({ userId: '1' }), res);

    expect(res.json).toHaveBeenCalledWith([
      {
        id: 2,
        userId: 2,
        username: 'bea',
        displayName: 'Bea',
        avatar: '/avatars/avatar02.png',
        friendsSince: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('listMyFriendRequests returns incoming and outgoing requests', async () => {
    vi.mocked(mockRepo.listPendingFriendRequests).mockResolvedValue([
      {
        id: 10,
        status: 'pending',
        created_at: '2026-01-03T00:00:00.000Z',
        direction: 'incoming',
        user: {
          user_id: 2,
          username: 'bea',
          display_name: 'Bea',
          avatar: null,
        },
      },
    ]);

    const res = makeRes();
    await controller.listMyFriendRequests(makeReq({ userId: '1' }), res);

    expect(res.json).toHaveBeenCalledWith([
      {
        id: 10,
        status: 'pending',
        createdAt: '2026-01-03T00:00:00.000Z',
        direction: 'incoming',
        user: {
          id: 2,
          userId: 2,
          username: 'bea',
          displayName: 'Bea',
          avatar: null,
        },
      },
    ]);
  });

  it('sendFriendRequest maps domain errors to HTTP errors', async () => {
    vi.mocked(mockRepo.createFriendRequest).mockRejectedValue(new FriendRequestAlreadyExistsError());

    const res = makeRes();
    await controller.sendFriendRequest(makeReq({ userId: '1', body: { username: 'bea' } }), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('acceptFriendRequest returns the accepted request', async () => {
    vi.mocked(mockRepo.acceptFriendRequest).mockResolvedValue({
      id: 10,
      status: 'accepted',
      created_at: '2026-01-03T00:00:00.000Z',
      direction: 'incoming',
      user: {
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        avatar: null,
      },
    });

    const res = makeRes();
    await controller.acceptFriendRequest(makeReq({ userId: '1', params: { requestId: '10' } }), res);

    expect(mockRepo.acceptFriendRequest).toHaveBeenCalledWith(10, 1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 10, status: 'accepted' }));
  });

  it('deleteFriendRequest returns 204 on success', async () => {
    const res = makeRes();

    await controller.deleteFriendRequest(makeReq({ userId: '1', params: { requestId: '10' } }), res);

    expect(mockRepo.deleteFriendRequest).toHaveBeenCalledWith(10, 1);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('unfriend returns 204 on success', async () => {
    const res = makeRes();

    await controller.unfriend(makeReq({ userId: '1', params: { friendUserId: '2' } }), res);

    expect(mockRepo.deleteFriendship).toHaveBeenCalledWith(1, 2);
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it.each([
    new ProfileNotFoundError(),
    new FriendRequestNotFoundError(),
    new ForbiddenFriendRequestActionError(),
    new FriendshipNotFoundError(),
    new ValidationError('bad request'),
  ])('handleHttpError maps %s', async (error) => {
    vi.mocked(mockRepo.deleteFriendship).mockRejectedValue(error);
    const res = makeRes();

    await controller.unfriend(makeReq({ userId: '1', params: { friendUserId: '2' } }), res);

    expect(res.status).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });
});

describe('UsersController friendship status', () => {
  it('returns whether the authenticated user is friend with the target profile', async () => {
    const mockService = {
      onUserCreated: vi.fn(),
      onProfileUpdated: vi.fn(),
      onUserDeleted: vi.fn(),
    } as unknown as UsersService;
    const mockRepo = {
      hasFriendship: vi.fn().mockResolvedValue(true),
      getById: vi.fn().mockResolvedValue({
        id: 2,
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        email: null,
        avatar: null,
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    } as unknown as UserRepository;
    const controller = new UsersController(mockService, mockRepo);
    const res = makeRes();

    await controller.getFriendshipStatus(makeReq({ userId: '1', params: { friendUserId: '2' } }), res);

    expect(mockRepo.hasFriendship).toHaveBeenCalledWith(1, 2);
    expect(res.json).toHaveBeenCalledWith({
      friend: true,
      user: {
        id: 2,
        userId: 2,
        username: 'bea',
        displayName: 'Bea',
        avatar: null,
      },
    });
  });
});
