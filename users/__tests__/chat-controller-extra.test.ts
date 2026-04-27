import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatController } from '../src/controllers/chat.controller.js';
import { HttpError } from '../src/errors/http-error.js';
import type { ChatRealtimeNotifier } from '../src/realtime/chatSocketServer.js';
import type { ChatRepository } from '../src/repositories/chat.repository.js';

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
  query = {},
  userId,
}: {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  userId?: string;
} = {}): Request {
  return {
    params,
    body,
    query,
    userId,
  } as unknown as Request;
}

describe('ChatController', () => {
  let chatRepo: ChatRepository;
  let realtime: ChatRealtimeNotifier;
  let controller: ChatController;

  const message = {
    id: 10,
    conversation_id: 5,
    sender_user_id: 1,
    text: 'hola',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    chatRepo = {
      listConversations: vi.fn(),
      listMessages: vi.fn(),
      sendMessage: vi.fn(),
    } as unknown as ChatRepository;
    realtime = {
      emitMessage: vi.fn(),
    } satisfies ChatRealtimeNotifier;
    controller = new ChatController(chatRepo, realtime);
  });

  it('lists conversations using the API response shape', async () => {
    vi.mocked(chatRepo.listConversations).mockResolvedValue([
      {
        id: 5,
        updated_at: '2026-01-01T00:05:00.000Z',
        other_user: {
          user_id: 2,
          username: 'bea',
          display_name: 'Bea',
          avatar: '/avatars/avatar02.png',
        },
        last_message: message,
      },
      {
        id: 6,
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

    const res = makeRes();
    await controller.listMyConversations(makeReq({ userId: '1' }), res);

    expect(chatRepo.listConversations).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith([
      {
        id: 5,
        updatedAt: '2026-01-01T00:05:00.000Z',
        otherUser: {
          id: 2,
          username: 'bea',
          displayName: 'Bea',
          avatar: '/avatars/avatar02.png',
        },
        lastMessage: {
          id: 10,
          senderUserId: 1,
          text: 'hola',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
      {
        id: 6,
        updatedAt: '2026-01-01T00:00:00.000Z',
        otherUser: {
          id: 3,
          username: 'cai',
          displayName: null,
          avatar: null,
        },
        lastMessage: null,
      },
    ]);
  });

  it('requires authentication before listing conversations', async () => {
    const res = makeRes();

    await controller.listMyConversations(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(chatRepo.listConversations).not.toHaveBeenCalled();
  });

  it('lists messages with optional pagination', async () => {
    vi.mocked(chatRepo.listMessages).mockResolvedValue({
      conversation_id: 5,
      messages: [message],
    });

    const res = makeRes();
    await controller.listMessagesWithFriend(
      makeReq({ userId: '1', params: { friendUserId: '2' }, query: { limit: '20', beforeId: '99' } }),
      res,
    );

    expect(chatRepo.listMessages).toHaveBeenCalledWith(1, 2, { limit: 20, beforeId: 99 });
    expect(res.json).toHaveBeenCalledWith({
      conversationId: 5,
      messages: [
        {
          id: 10,
          conversationId: 5,
          senderUserId: 1,
          text: 'hola',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('validates user and friend ids before listing or sending messages', async () => {
    const unauthenticatedList = makeRes();
    await controller.listMessagesWithFriend(makeReq({ params: { friendUserId: '2' } }), unauthenticatedList);
    expect(unauthenticatedList.status).toHaveBeenCalledWith(401);

    const invalidFriendList = makeRes();
    await controller.listMessagesWithFriend(makeReq({ userId: '1', params: { friendUserId: 'abc' } }), invalidFriendList);
    expect(invalidFriendList.status).toHaveBeenCalledWith(400);

    const unauthenticatedSend = makeRes();
    await controller.sendMessageToFriend(makeReq({ params: { friendUserId: '2' }, body: { text: 'hola' } }), unauthenticatedSend);
    expect(unauthenticatedSend.status).toHaveBeenCalledWith(401);

    const invalidFriendSend = makeRes();
    await controller.sendMessageToFriend(makeReq({ userId: '1', params: { friendUserId: 'nope' }, body: { text: 'hola' } }), invalidFriendSend);
    expect(invalidFriendSend.status).toHaveBeenCalledWith(400);
  });

  it('keeps the HTTP response successful if realtime notification fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chatRepo.sendMessage).mockResolvedValue(message);
    vi.mocked(realtime.emitMessage).mockImplementation(() => {
      throw new Error('socket down');
    });

    const res = makeRes();
    await controller.sendMessageToFriend(
      makeReq({ userId: '1', params: { friendUserId: '2' }, body: { text: 'hola' } }),
      res,
    );

    expect(realtime.emitMessage).toHaveBeenCalledWith(message);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 10, text: 'hola' }));
    consoleSpy.mockRestore();
  });

  it('maps known and unknown repository errors to HTTP responses', async () => {
    vi.mocked(chatRepo.listConversations).mockRejectedValueOnce(new HttpError(403, 'not_friends', 'Only friends'));
    const knownErrorRes = makeRes();
    await controller.listMyConversations(makeReq({ userId: '1' }), knownErrorRes);
    expect(knownErrorRes.status).toHaveBeenCalledWith(403);
    expect(knownErrorRes.json).toHaveBeenCalledWith({ error: 'not_friends', message: 'Only friends' });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chatRepo.listMessages).mockRejectedValueOnce(new Error('database down'));
    const unknownErrorRes = makeRes();
    await controller.listMessagesWithFriend(makeReq({ userId: '1', params: { friendUserId: '2' } }), unknownErrorRes);
    expect(unknownErrorRes.status).toHaveBeenCalledWith(500);
    expect(unknownErrorRes.json).toHaveBeenCalledWith({ error: 'internal_server_error', message: 'Internal server error' });
    consoleSpy.mockRestore();
  });
});
