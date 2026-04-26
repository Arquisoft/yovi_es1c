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
      getById: vi.fn(),
      getByUsername: vi.fn(),
      updateProfile: vi.fn(),
      listFriends: vi.fn(),
      listPendingFriendRequests: vi.fn(),
      createFriendRequest: vi.fn(),
      acceptFriendRequest: vi.fn(),
      deleteFriendRequest: vi.fn(),
      deleteFriendship: vi.fn(),
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
    const req = makeReq({ body: { username: 'alex' } });
    const res = makeRes();

    await controller.createProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'userId and username are required' });
  });

  it('createProfile returns 201 on success', async () => {
    vi.mocked(mockRepo.createProfile).mockResolvedValue(fullProfile);

    const req = makeReq({ body: { userId: 1, username: 'alex', avatar: '/avatars/avatar01.png' } });
    const res = makeRes();

    await controller.createProfile(req, res);

    expect(mockRepo.createProfile).toHaveBeenCalledWith(1, 'alex', '/avatars/avatar01.png');
    expect(mockService.onUserCreated).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(fullProfile);
  });

  it('getProfile returns 404 when missing', async () => {
    vi.mocked(mockRepo.getById).mockResolvedValue(null);
    const res = makeRes();

    await controller.getProfile(makeReq({ params: { id: '99' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Profile not found' });
  });

  it('getProfileByUsername returns profile on success', async () => {
    vi.mocked(mockRepo.getByUsername).mockResolvedValue(fullProfile);
    const res = makeRes();

    await controller.getProfileByUsername(makeReq({ params: { username: 'alex' } }), res);

    expect(res.json).toHaveBeenCalledWith(fullProfile);
  });

  it('getMyProfile creates a profile when missing and returns camelCase payload', async () => {
    vi.mocked(mockRepo.getById).mockResolvedValueOnce(null).mockResolvedValueOnce(fullProfile);
    vi.mocked(mockRepo.createProfile).mockResolvedValue(fullProfile);

    const res = makeRes();
    await controller.getMyProfile(makeReq({ userId: '1', username: 'alex' }), res);

    expect(mockRepo.createProfile).toHaveBeenCalledWith(1, 'alex', '/avatars/avatar01.png');
    expect(res.json).toHaveBeenCalledWith({
      id: 1,
      username: 'alex',
      displayName: 'Alex Visible',
      email: 'alex@yovi.test',
      avatar: '/avatars/avatar01.png',
    });
  });

  it('updateMyProfile returns updated profile in camelCase', async () => {
    vi.mocked(mockRepo.updateProfile).mockResolvedValue(fullProfile);
    const res = makeRes();

    await controller.updateMyProfile(
      makeReq({
        userId: '1',
        body: {
          displayName: 'Alex Visible',
          email: 'alex@yovi.test',
          avatar: '/avatars/avatar01.png',
        },
      }),
      res,
    );

    expect(mockRepo.updateProfile).toHaveBeenCalledWith(1, {
      displayName: 'Alex Visible',
      email: 'alex@yovi.test',
      avatar: '/avatars/avatar01.png',
    });
    expect(mockService.onProfileUpdated).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({
      id: 1,
      username: 'alex',
      displayName: 'Alex Visible',
      email: 'alex@yovi.test',
      avatar: '/avatars/avatar01.png',
    });
  });

  it('listMyFriends returns mapped friends', async () => {
    vi.mocked(mockRepo.listFriends).mockResolvedValue([
      {
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        avatar: '/avatars/avatar02.png',
        friendship_created_at: '2026-03-10T10:00:00.000Z',
      },
    ]);

    const res = makeRes();
    await controller.listMyFriends(makeReq({ userId: '1' }), res);

    expect(res.json).toHaveBeenCalledWith([
      {
        id: 2,
        username: 'bea',
        displayName: 'Bea',
        avatar: '/avatars/avatar02.png',
        friendsSince: '2026-03-10T10:00:00.000Z',
      },
    ]);
  });

  it('listMyFriendRequests returns mapped incoming and outgoing requests', async () => {
    vi.mocked(mockRepo.listPendingFriendRequests).mockResolvedValue([
      {
        id: 7,
        status: 'pending',
        created_at: '2026-03-10T10:00:00.000Z',
        direction: 'incoming',
        user: {
          user_id: 2,
          username: 'bea',
          display_name: 'Bea',
          avatar: '/avatars/avatar02.png',
        },
      },
    ]);

    const res = makeRes();
    await controller.listMyFriendRequests(makeReq({ userId: '1' }), res);

    expect(res.json).toHaveBeenCalledWith([
      {
        id: 7,
        status: 'pending',
        createdAt: '2026-03-10T10:00:00.000Z',
        direction: 'incoming',
        user: {
          id: 2,
          username: 'bea',
          displayName: 'Bea',
          avatar: '/avatars/avatar02.png',
        },
      },
    ]);
  });

  it('sendFriendRequest returns 201 and mapped payload', async () => {
    vi.mocked(mockRepo.createFriendRequest).mockResolvedValue({
      id: 7,
      status: 'pending',
      created_at: '2026-03-10T10:00:00.000Z',
      direction: 'outgoing',
      user: {
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        avatar: '/avatars/avatar02.png',
      },
    });

    const res = makeRes();
    await controller.sendFriendRequest(makeReq({ userId: '1', body: { username: 'bea' } }), res);

    expect(mockRepo.createFriendRequest).toHaveBeenCalledWith(1, 'bea');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      id: 7,
      status: 'pending',
      createdAt: '2026-03-10T10:00:00.000Z',
      direction: 'outgoing',
      user: {
        id: 2,
        username: 'bea',
        displayName: 'Bea',
        avatar: '/avatars/avatar02.png',
      },
    });
  });

  it('sendFriendRequest maps domain errors', async () => {
    vi.mocked(mockRepo.createFriendRequest).mockRejectedValue(new FriendRequestAlreadyExistsError());
    const res = makeRes();

    await controller.sendFriendRequest(makeReq({ userId: '1', body: { username: 'bea' } }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'friend_request_exists',
      message: 'There is already a pending friend request between these users',
    });
  });

  it('acceptFriendRequest returns mapped payload', async () => {
    vi.mocked(mockRepo.acceptFriendRequest).mockResolvedValue({
      id: 8,
      status: 'accepted',
      created_at: '2026-03-10T10:00:00.000Z',
      direction: 'incoming',
      user: {
        user_id: 3,
        username: 'cora',
        display_name: 'Cora',
        avatar: '/avatars/avatar03.png',
      },
    });

    const res = makeRes();
    await controller.acceptFriendRequest(makeReq({ userId: '1', params: { requestId: '8' } }), res);

    expect(mockRepo.acceptFriendRequest).toHaveBeenCalledWith(8, 1);
    expect(res.json).toHaveBeenCalledWith({
      id: 8,
      status: 'accepted',
      createdAt: '2026-03-10T10:00:00.000Z',
      direction: 'incoming',
      user: {
        id: 3,
        username: 'cora',
        displayName: 'Cora',
        avatar: '/avatars/avatar03.png',
      },
    });
  });

  it('acceptFriendRequest returns 403 for forbidden actions', async () => {
    vi.mocked(mockRepo.acceptFriendRequest).mockRejectedValue(new ForbiddenFriendRequestActionError());
    const res = makeRes();

    await controller.acceptFriendRequest(makeReq({ userId: '1', params: { requestId: '8' } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'forbidden_friend_request_action',
      message: 'You are not allowed to modify this friend request',
    });
  });

  it('deleteFriendRequest returns 204', async () => {
    vi.mocked(mockRepo.deleteFriendRequest).mockResolvedValue(undefined);
    const res = makeRes();

    await controller.deleteFriendRequest(makeReq({ userId: '1', params: { requestId: '9' } }), res);

    expect(mockRepo.deleteFriendRequest).toHaveBeenCalledWith(9, 1);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('deleteFriendRequest returns 404 when request does not exist', async () => {
    vi.mocked(mockRepo.deleteFriendRequest).mockRejectedValue(new FriendRequestNotFoundError());
    const res = makeRes();

    await controller.deleteFriendRequest(makeReq({ userId: '1', params: { requestId: '9' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'friend_request_not_found',
      message: 'Friend request not found',
    });
  });

  it('unfriend returns 204', async () => {
    vi.mocked(mockRepo.deleteFriendship).mockResolvedValue(undefined);
    const res = makeRes();

    await controller.unfriend(makeReq({ userId: '1', params: { friendUserId: '2' } }), res);

    expect(mockRepo.deleteFriendship).toHaveBeenCalledWith(1, 2);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('unfriend returns 400 when friend user id is invalid', async () => {
    const res = makeRes();

    await controller.unfriend(makeReq({ userId: '1', params: { friendUserId: 'nope' } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid friend user id' });
  });

  it('unfriend returns 404 when friendship does not exist', async () => {
    vi.mocked(mockRepo.deleteFriendship).mockRejectedValue(new FriendshipNotFoundError());
    const res = makeRes();

    await controller.unfriend(makeReq({ userId: '1', params: { friendUserId: '2' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'friendship_not_found',
      message: 'Friendship not found',
    });
  });

  it('returns 404 when sending a request to an unknown profile', async () => {
    vi.mocked(mockRepo.createFriendRequest).mockRejectedValue(new ProfileNotFoundError());
    const res = makeRes();

    await controller.sendFriendRequest(makeReq({ userId: '1', body: { username: 'ghost' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'profile_not_found',
      message: 'Profile not found',
    });
  });
});
