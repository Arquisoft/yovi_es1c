import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ChatController } from '../src/controllers/chat.controller.js';
import type { ChatRepository } from '../src/repositories/chat.repository.js';
import type { ChatRealtimeNotifier } from '../src/realtime/chatSocketServer.js';

describe('ChatController realtime notifications', () => {
  it('emits a realtime chat event after sending a message', async () => {
    const message = {
      id: 10,
      conversation_id: 99,
      sender_user_id: 1,
      text: 'hola',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const chatRepo = {
      sendMessage: vi.fn().mockResolvedValue(message),
    } as unknown as ChatRepository;
    const realtime = {
      emitMessage: vi.fn(),
    } satisfies ChatRealtimeNotifier;
    const controller = new ChatController(chatRepo, realtime);

    const app = express();
    app.use(express.json());
    app.post('/chat/with/:friendUserId/messages', (req, _res, next) => {
      req.userId = '1';
      next();
    }, controller.sendMessageToFriend.bind(controller));

    const response = await request(app).post('/chat/with/2/messages').send({ text: 'hola' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: 10,
      conversationId: 99,
      senderUserId: 1,
      text: 'hola',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(chatRepo.sendMessage).toHaveBeenCalledWith(1, 2, 'hola');
    expect(realtime.emitMessage).toHaveBeenCalledWith(message);
  });
});
