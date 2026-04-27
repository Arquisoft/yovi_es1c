import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersController } from '../src/controllers/users.controller.js';
import { HttpError } from '../src/errors/http-error.js';
import type { UserRepository } from '../src/repositories/users.repository.js';
import type { UsersService } from '../src/services/users.service.js';

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

const profile = {
  id: 1,
  user_id: 1,
  username: 'alex',
  display_name: null,
  email: null,
  avatar: '/avatars/avatar01.png',
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('UsersController additional branches', () => {
  let usersService: UsersService;
  let userRepository: UserRepository;
  let controller: UsersController;

  beforeEach(() => {
    usersService = {
      onUserCreated: vi.fn(),
      onProfileUpdated: vi.fn(),
      onUserDeleted: vi.fn(),
    } as unknown as UsersService;

    userRepository = {
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
    } as unknown as UserRepository;

    controller = new UsersController(usersService, userRepository);
  });

  it('creates a profile without an authenticated token and applies the default avatar', async () => {
    vi.mocked(userRepository.createProfile).mockResolvedValue(profile);
    const res = makeRes();

    await controller.createProfile(makeReq({ body: { id: 1, username: 'alex' } }), res);

    expect(userRepository.createProfile).toHaveBeenCalledWith(1, 'alex', '/avatars/avatar01.png');
    expect(usersService.onUserCreated).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('maps create profile unique constraint and unknown errors', async () => {
    vi.mocked(userRepository.createProfile).mockRejectedValueOnce(new Error('UNIQUE constraint failed: user_profiles.username'));
    const uniqueRes = makeRes();
    await controller.createProfile(makeReq({ body: { user_id: 1, username: 'alex' }, userId: '1' }), uniqueRes);
    expect(uniqueRes.status).toHaveBeenCalledWith(409);
    expect(uniqueRes.json).toHaveBeenCalledWith({ error: 'Username already exists' });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(userRepository.createProfile).mockRejectedValueOnce(new Error('database down'));
    const unknownRes = makeRes();
    await controller.createProfile(makeReq({ body: { user_id: 1, username: 'alex' }, userId: '1' }), unknownRes);
    expect(unknownRes.status).toHaveBeenCalledWith(500);
    expect(unknownRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    consoleSpy.mockRestore();
  });

  it('validates profile reads by id and username', async () => {
    const invalidIdRes = makeRes();
    await controller.getProfile(makeReq({ params: { id: 'abc' } }), invalidIdRes);
    expect(invalidIdRes.status).toHaveBeenCalledWith(400);

    vi.mocked(userRepository.getByUsername).mockResolvedValueOnce(null);
    const missingUsernameRes = makeRes();
    await controller.getProfileByUsername(makeReq({ params: { username: 'missing' } }), missingUsernameRes);
    expect(missingUsernameRes.status).toHaveBeenCalledWith(404);
  });

  it('handles getMyProfile repository HTTP errors', async () => {
    vi.mocked(userRepository.ensureProfile).mockRejectedValueOnce(new HttpError(404, 'profile_not_found', 'Profile not found'));
    const res = makeRes();

    await controller.getMyProfile(makeReq({ userId: '1', username: 'alex' }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'profile_not_found', message: 'Profile not found' });
  });

  it('validates updateMyProfile authentication, avatar and missing profile branches', async () => {
    const unauthenticatedRes = makeRes();
    await controller.updateMyProfile(makeReq({ body: { displayName: 'Alex' } }), unauthenticatedRes);
    expect(unauthenticatedRes.status).toHaveBeenCalledWith(401);

    const invalidAvatarRes = makeRes();
    await controller.updateMyProfile(makeReq({ userId: '1', body: { avatar: '/invalid.png' } }), invalidAvatarRes);
    expect(invalidAvatarRes.status).toHaveBeenCalledWith(400);
    expect(userRepository.updateProfile).not.toHaveBeenCalled();

    vi.mocked(userRepository.updateProfile).mockResolvedValueOnce(null);
    const missingProfileRes = makeRes();
    await controller.updateMyProfile(makeReq({ userId: '1', body: { displayName: 'Alex' } }), missingProfileRes);
    expect(missingProfileRes.status).toHaveBeenCalledWith(404);
  });

  it('validates admin-style profile update avatar, missing and success branches', async () => {
    const invalidAvatarRes = makeRes();
    await controller.updateProfile(makeReq({ params: { id: '1' }, body: { avatar: '/invalid.png' } }), invalidAvatarRes);
    expect(invalidAvatarRes.status).toHaveBeenCalledWith(400);

    vi.mocked(userRepository.updateProfile).mockResolvedValueOnce(null);
    const missingRes = makeRes();
    await controller.updateProfile(makeReq({ params: { id: '1' }, body: { avatar: null } }), missingRes);
    expect(missingRes.status).toHaveBeenCalledWith(404);

    vi.mocked(userRepository.updateProfile).mockResolvedValueOnce({ ...profile, avatar: '/avatars/avatar03.png' });
    const successRes = makeRes();
    await controller.updateProfile(makeReq({ params: { id: '1' }, body: { avatar: '/avatars/avatar03.png' } }), successRes);
    expect(usersService.onProfileUpdated).toHaveBeenCalledOnce();
    expect(successRes.json).toHaveBeenCalledWith(expect.objectContaining({ avatar: '/avatars/avatar03.png' }));
  });

  it('requires authentication for friends endpoints', async () => {
    const friendsRes = makeRes();
    await controller.listMyFriends(makeReq(), friendsRes);
    expect(friendsRes.status).toHaveBeenCalledWith(401);

    const requestsRes = makeRes();
    await controller.listMyFriendRequests(makeReq(), requestsRes);
    expect(requestsRes.status).toHaveBeenCalledWith(401);

    const sendRes = makeRes();
    await controller.sendFriendRequest(makeReq({ body: { username: 'bea' } }), sendRes);
    expect(sendRes.status).toHaveBeenCalledWith(401);
  });

  it('sends friend requests and serializes the created request', async () => {
    vi.mocked(userRepository.createFriendRequest).mockResolvedValueOnce({
      id: 10,
      status: 'pending',
      created_at: '2026-01-02T00:00:00.000Z',
      direction: 'outgoing',
      user: {
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        avatar: null,
      },
    });

    const res = makeRes();
    await controller.sendFriendRequest(makeReq({ userId: '1', body: { username: 'bea' } }), res);

    expect(userRepository.createFriendRequest).toHaveBeenCalledWith(1, 'bea');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      id: 10,
      status: 'pending',
      createdAt: '2026-01-02T00:00:00.000Z',
      direction: 'outgoing',
      user: {
        id: 2,
        userId: 2,
        username: 'bea',
        displayName: 'Bea',
        avatar: null,
      },
    });
  });

  it('validates request ids and friend ids before mutating friend state', async () => {
    const unauthorizedAcceptRes = makeRes();
    await controller.acceptFriendRequest(makeReq({ params: { requestId: '1' } }), unauthorizedAcceptRes);
    expect(unauthorizedAcceptRes.status).toHaveBeenCalledWith(401);

    const invalidAcceptRes = makeRes();
    await controller.acceptFriendRequest(makeReq({ userId: '1', params: { requestId: 'abc' } }), invalidAcceptRes);
    expect(invalidAcceptRes.status).toHaveBeenCalledWith(400);

    const unauthorizedDeleteRes = makeRes();
    await controller.deleteFriendRequest(makeReq({ params: { requestId: '1' } }), unauthorizedDeleteRes);
    expect(unauthorizedDeleteRes.status).toHaveBeenCalledWith(401);

    const invalidDeleteRes = makeRes();
    await controller.deleteFriendRequest(makeReq({ userId: '1', params: { requestId: 'abc' } }), invalidDeleteRes);
    expect(invalidDeleteRes.status).toHaveBeenCalledWith(400);

    const unauthorizedUnfriendRes = makeRes();
    await controller.unfriend(makeReq({ params: { friendUserId: '2' } }), unauthorizedUnfriendRes);
    expect(unauthorizedUnfriendRes.status).toHaveBeenCalledWith(401);

    const invalidUnfriendRes = makeRes();
    await controller.unfriend(makeReq({ userId: '1', params: { friendUserId: 'abc' } }), invalidUnfriendRes);
    expect(invalidUnfriendRes.status).toHaveBeenCalledWith(400);
  });
});
