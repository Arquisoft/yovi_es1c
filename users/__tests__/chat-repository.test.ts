import type { Database } from 'sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFriendsError, ValidationError } from '../src/errors/domain-errors.js';
import { ChatRepository } from '../src/repositories/chat.repository.js';
import type { UserRepository } from '../src/repositories/users.repository.js';

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

describe('ChatRepository', () => {
  let db: ReturnType<typeof makeDb>;
  let usersRepo: UserRepository & { hasFriendship: ReturnType<typeof vi.fn> };
  let repo: ChatRepository;

  beforeEach(() => {
    db = makeDb();
    usersRepo = {
      hasFriendship: vi.fn(),
    } as unknown as UserRepository & { hasFriendship: ReturnType<typeof vi.fn> };
    repo = new ChatRepository(db, usersRepo);
  });

  it('maps conversations with and without a last message', async () => {
    db.all.mockResolvedValueOnce([
      {
        conversation_id: 7,
        conversation_updated_at: '2026-01-01T00:10:00.000Z',
        other_user_id: 2,
        other_username: 'bea',
        other_display_name: 'Bea',
        other_avatar: '/avatars/avatar02.png',
        last_message_id: 11,
        last_message_sender_user_id: 1,
        last_message_text: 'hola',
        last_message_created_at: '2026-01-01T00:09:00.000Z',
      },
      {
        conversation_id: 8,
        conversation_updated_at: '2026-01-01T00:00:00.000Z',
        other_user_id: 3,
        other_username: 'cai',
        other_display_name: null,
        other_avatar: null,
        last_message_id: null,
      },
    ]);

    await expect(repo.listConversations(1)).resolves.toEqual([
      {
        id: 7,
        updated_at: '2026-01-01T00:10:00.000Z',
        other_user: {
          user_id: 2,
          username: 'bea',
          display_name: 'Bea',
          avatar: '/avatars/avatar02.png',
        },
        last_message: {
          id: 11,
          sender_user_id: 1,
          text: 'hola',
          created_at: '2026-01-01T00:09:00.000Z',
        },
      },
      {
        id: 8,
        updated_at: '2026-01-01T00:00:00.000Z',
        other_user: {
          user_id: 3,
          username: 'cai',
          display_name: null,
          avatar: null,
        },
        last_message: null,
      },
    ]);
    expect(db.all).toHaveBeenCalledWith(expect.stringContaining('FROM chat_conversations'), [1, 1, 1]);
  });

  it('rejects conversations with yourself or users that are not friends', async () => {
    await expect(repo.getOrCreateConversationForFriends(1, 1)).rejects.toBeInstanceOf(ValidationError);

    usersRepo.hasFriendship.mockResolvedValueOnce(false);
    await expect(repo.getOrCreateConversationForFriends(1, 2)).rejects.toBeInstanceOf(NotFriendsError);
  });

  it('returns an existing conversation for friends', async () => {
    usersRepo.hasFriendship.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce({ id: 42 });

    await expect(repo.getOrCreateConversationForFriends(5, 2)).resolves.toBe(42);

    expect(db.get).toHaveBeenCalledWith(expect.stringContaining('FROM chat_conversations'), [2, 5]);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('creates a conversation with sorted user ids when it does not exist', async () => {
    usersRepo.hasFriendship.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce(null);
    db.run.mockResolvedValueOnce({ lastID: 55 });

    await expect(repo.getOrCreateConversationForFriends(9, 4)).resolves.toBe(55);

    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chat_conversations'), [4, 9]);
  });

  it('lists recent messages and clamps pagination limits', async () => {
    usersRepo.hasFriendship.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce({ id: 5 });
    db.all.mockResolvedValueOnce([
      {
        id: 20,
        conversation_id: 5,
        sender_user_id: 2,
        text: 'segundo',
        created_at: '2026-01-01T00:02:00.000Z',
      },
    ]);

    await expect(repo.listMessages(1, 2, { limit: 999, beforeId: 50 })).resolves.toEqual({
      conversation_id: 5,
      messages: [
        {
          id: 20,
          conversation_id: 5,
          sender_user_id: 2,
          text: 'segundo',
          created_at: '2026-01-01T00:02:00.000Z',
        },
      ],
    });

    expect(db.all).toHaveBeenCalledWith(expect.stringContaining('AND id < ?'), [5, 50, 100]);
  });

  it('lists messages without beforeId and uses a minimum limit of one', async () => {
    usersRepo.hasFriendship.mockResolvedValueOnce(true);
    db.get.mockResolvedValueOnce({ id: 5 });
    db.all.mockResolvedValueOnce([]);

    await expect(repo.listMessages(1, 2, { limit: 0 })).resolves.toEqual({ conversation_id: 5, messages: [] });

    expect(db.all).toHaveBeenCalledWith(expect.not.stringContaining('AND id < ?'), [5, 1]);
  });

  it('validates message text before persisting it', async () => {
    await expect(repo.sendMessage(1, 2, '   ')).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.sendMessage(1, 2, 'a'.repeat(2001))).rejects.toBeInstanceOf(ValidationError);
    expect(db.run).not.toHaveBeenCalled();
  });

  it('trims, stores and returns a sent message', async () => {
    usersRepo.hasFriendship.mockResolvedValueOnce(true);
    db.get
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce({
        id: 77,
        conversation_id: 5,
        sender_user_id: 1,
        text: 'hola',
        created_at: '2026-01-01T00:00:00.000Z',
      });
    db.run
      .mockResolvedValueOnce({ lastID: 77 })
      .mockResolvedValueOnce({ changes: 1 });

    await expect(repo.sendMessage(1, 2, '  hola  ')).resolves.toEqual({
      id: 77,
      conversation_id: 5,
      sender_user_id: 1,
      text: 'hola',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    expect(db.run).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO chat_messages'), [5, 1, 'hola']);
    expect(db.run).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE chat_conversations'), [5]);
    expect(db.get).toHaveBeenLastCalledWith(expect.stringContaining('FROM chat_messages'), [77]);
  });
});
