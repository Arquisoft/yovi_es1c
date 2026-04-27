import type { Database } from 'sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenFriendRequestActionError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError,
  FriendshipNotFoundError,
  ProfileNotFoundError,
  ValidationError,
} from '../src/errors/domain-errors.js';
import { UserRepository } from '../src/repositories/users.repository.js';

function makeDb() {
  return {
    all: vi.fn(),
    get: vi.fn(),
    run: vi.fn(),
  } as unknown as Database & {
    all: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };
}

const alexRow = {
  user_id: 1,
  username: 'alex',
  display_name: 'Alex',
  email: 'alex@yovi.test',
  avatar: '/avatars/avatar01.png',
  created_at: '2026-01-01T00:00:00.000Z',
};

const beaRow = {
  user_id: 2,
  username: 'bea',
  display_name: 'Bea',
  email: 'bea@yovi.test',
  avatar: '/avatars/avatar02.png',
  created_at: '2026-01-02T00:00:00.000Z',
};

describe('UserRepository', () => {
  let db: ReturnType<typeof makeDb>;
  let repo: UserRepository;

  beforeEach(() => {
    db = makeDb();
    repo = new UserRepository(db);
  });

  it('creates, ensures and maps profiles', async () => {
    db.get.mockResolvedValueOnce(alexRow);

    await expect(repo.createProfile(1, 'alex', '/avatars/avatar01.png')).resolves.toEqual({
      id: 1,
      user_id: 1,
      username: 'alex',
      display_name: 'Alex',
      email: 'alex@yovi.test',
      avatar: '/avatars/avatar01.png',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_profiles'), [1, 'alex', '/avatars/avatar01.png']);

    db.get.mockResolvedValueOnce(alexRow);
    await expect(repo.ensureProfile(1, 'ignored')).resolves.toEqual(expect.objectContaining({ username: 'alex' }));

    db.get.mockResolvedValueOnce(null).mockResolvedValueOnce(beaRow);
    await expect(repo.ensureProfile(2, 'bea', '/avatars/avatar02.png')).resolves.toEqual(expect.objectContaining({ user_id: 2 }));
    expect(db.run).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO user_profiles'), [2, 'bea', '/avatars/avatar02.png']);
  });

  it('gets profiles by id or username and returns null when missing', async () => {
    db.get.mockResolvedValueOnce(alexRow).mockResolvedValueOnce(beaRow).mockResolvedValueOnce(null);

    await expect(repo.getById(1)).resolves.toEqual(expect.objectContaining({ user_id: 1, username: 'alex' }));
    await expect(repo.getByUsername('bea')).resolves.toEqual(expect.objectContaining({ user_id: 2, username: 'bea' }));
    await expect(repo.getById(99)).resolves.toBeNull();
  });

  it('updates only provided profile fields', async () => {
    db.get
      .mockResolvedValueOnce(alexRow)
      .mockResolvedValueOnce({ ...alexRow, display_name: 'Alex Updated', avatar: null });

    await expect(repo.updateProfile(1, { displayName: 'Alex Updated', avatar: null })).resolves.toEqual(
      expect.objectContaining({ display_name: 'Alex Updated', email: 'alex@yovi.test', avatar: null }),
    );

    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_profiles'), [
      'Alex Updated',
      'alex@yovi.test',
      null,
      1,
    ]);

    db.get.mockResolvedValueOnce(null);
    await expect(repo.updateProfile(99, { displayName: 'Missing' })).resolves.toBeNull();
  });

  it('lists friends and detects friendships', async () => {
    db.all.mockResolvedValueOnce([
      {
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        avatar: null,
        friendship_created_at: '2026-01-03T00:00:00.000Z',
      },
    ]);
    db.get.mockResolvedValueOnce({ ok: 1 }).mockResolvedValueOnce(null);

    await expect(repo.listFriends(1)).resolves.toEqual([
      {
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        avatar: null,
        friendship_created_at: '2026-01-03T00:00:00.000Z',
      },
    ]);
    await expect(repo.hasFriendship(1, 2)).resolves.toBe(true);
    await expect(repo.hasFriendship(1, 3)).resolves.toBe(false);
  });

  it('lists pending friend requests with incoming and outgoing directions', async () => {
    db.all
      .mockResolvedValueOnce([
        { ...beaRow, id: 10, status: 'pending', created_at: '2026-01-03T00:00:00.000Z' },
      ])
      .mockResolvedValueOnce([
        { id: 11, status: 'pending', created_at: '2026-01-04T00:00:00.000Z', user_id: 3, username: 'cai', display_name: null, avatar: null },
      ]);

    await expect(repo.listPendingFriendRequests(1)).resolves.toEqual([
      {
        id: 10,
        status: 'pending',
        created_at: '2026-01-03T00:00:00.000Z',
        direction: 'incoming',
        user: { user_id: 2, username: 'bea', display_name: 'Bea', avatar: '/avatars/avatar02.png' },
      },
      {
        id: 11,
        status: 'pending',
        created_at: '2026-01-04T00:00:00.000Z',
        direction: 'outgoing',
        user: { user_id: 3, username: 'cai', display_name: null, avatar: null },
      },
    ]);
  });

  it('validates friend request creation edge cases', async () => {
    await expect(repo.createFriendRequest(1, '   ')).rejects.toBeInstanceOf(ValidationError);

    db.get.mockResolvedValueOnce(null);
    await expect(repo.createFriendRequest(1, 'bea')).rejects.toBeInstanceOf(ProfileNotFoundError);

    db.get.mockResolvedValueOnce(alexRow).mockResolvedValueOnce(null);
    await expect(repo.createFriendRequest(1, 'bea')).rejects.toBeInstanceOf(ProfileNotFoundError);

    db.get.mockResolvedValueOnce(alexRow).mockResolvedValueOnce(alexRow);
    await expect(repo.createFriendRequest(1, 'alex')).rejects.toBeInstanceOf(ValidationError);

    db.get.mockResolvedValueOnce(alexRow).mockResolvedValueOnce(beaRow).mockResolvedValueOnce({ status: 'accepted' });
    await expect(repo.createFriendRequest(1, 'bea')).rejects.toBeInstanceOf(FriendshipAlreadyExistsError);

    db.get.mockResolvedValueOnce(alexRow).mockResolvedValueOnce(beaRow).mockResolvedValueOnce({ status: 'pending' });
    await expect(repo.createFriendRequest(1, 'bea')).rejects.toBeInstanceOf(FriendRequestAlreadyExistsError);
  });

  it('creates an outgoing friend request', async () => {
    db.get
      .mockResolvedValueOnce(alexRow)
      .mockResolvedValueOnce(beaRow)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 21,
        status: 'pending',
        created_at: '2026-01-05T00:00:00.000Z',
        user_id: 2,
        username: 'bea',
        display_name: 'Bea',
        avatar: null,
      });
    db.run.mockResolvedValueOnce({ lastID: 21 });

    await expect(repo.createFriendRequest(1, ' bea ')).resolves.toEqual({
      id: 21,
      status: 'pending',
      created_at: '2026-01-05T00:00:00.000Z',
      direction: 'outgoing',
      user: { user_id: 2, username: 'bea', display_name: 'Bea', avatar: null },
    });

    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO friend_requests'), [1, 2]);
  });

  it('accepts friend requests only by the recipient', async () => {
    db.get.mockResolvedValueOnce(null);
    await expect(repo.acceptFriendRequest(10, 1)).rejects.toBeInstanceOf(FriendRequestNotFoundError);

    db.get.mockResolvedValueOnce({ id: 10, sender_user_id: 1, recipient_user_id: 2 });
    await expect(repo.acceptFriendRequest(10, 1)).rejects.toBeInstanceOf(ForbiddenFriendRequestActionError);

    db.get
      .mockResolvedValueOnce({ id: 10, sender_user_id: 1, recipient_user_id: 2 })
      .mockResolvedValueOnce({
        id: 10,
        status: 'accepted',
        created_at: '2026-01-06T00:00:00.000Z',
        user_id: 1,
        username: 'alex',
        display_name: 'Alex',
        avatar: '/avatars/avatar01.png',
      });
    db.run.mockResolvedValueOnce({ changes: 1 });

    await expect(repo.acceptFriendRequest(10, 2)).resolves.toEqual({
      id: 10,
      status: 'accepted',
      created_at: '2026-01-06T00:00:00.000Z',
      direction: 'incoming',
      user: { user_id: 1, username: 'alex', display_name: 'Alex', avatar: '/avatars/avatar01.png' },
    });
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining("SET status = 'accepted'"), [10]);
  });

  it('deletes pending friend requests only for involved users', async () => {
    db.get.mockResolvedValueOnce(null);
    await expect(repo.deleteFriendRequest(10, 1)).rejects.toBeInstanceOf(FriendRequestNotFoundError);

    db.get.mockResolvedValueOnce({ id: 10, sender_user_id: 2, recipient_user_id: 3 });
    await expect(repo.deleteFriendRequest(10, 1)).rejects.toBeInstanceOf(ForbiddenFriendRequestActionError);

    db.get.mockResolvedValueOnce({ id: 10, sender_user_id: 1, recipient_user_id: 2 });
    db.run.mockResolvedValueOnce({ changes: 1 });
    await expect(repo.deleteFriendRequest(10, 1)).resolves.toBeUndefined();
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM friend_requests'), [10]);
  });

  it('deletes friendships and reports invalid deletion attempts', async () => {
    await expect(repo.deleteFriendship(1, 1)).rejects.toBeInstanceOf(ValidationError);

    db.run.mockResolvedValueOnce({ changes: 0 });
    await expect(repo.deleteFriendship(1, 2)).rejects.toBeInstanceOf(FriendshipNotFoundError);

    db.run.mockResolvedValueOnce({ changes: 1 });
    await expect(repo.deleteFriendship(1, 2)).resolves.toBeUndefined();
    expect(db.run).toHaveBeenLastCalledWith(expect.stringContaining("WHERE status = 'accepted'"), [1, 2, 2, 1]);
  });
});
