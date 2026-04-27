import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendshipClient } from '../src/services/FriendshipClient';

describe('FriendshipClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads friendship status from users service with the bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ friend: true, user: { id: 2, userId: 2, username: 'bea' } }), { status: 200 }),
    );

    const client = new FriendshipClient('http://users:3000/api/users/');
    await expect(client.getFriendshipStatus(2, 'Bearer token')).resolves.toEqual({
      friend: true,
      user: { id: 2, userId: 2, username: 'bea' },
    });

    expect(fetchMock).toHaveBeenCalledWith('http://users:3000/api/users/friends/2/status', {
      method: 'GET',
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('treats non-2xx responses as missing friendship', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 403 }));

    const client = new FriendshipClient('http://users:3000/api/users');
    await expect(client.getFriendshipStatus(2, 'Bearer token')).resolves.toEqual({ friend: false });
  });
});
