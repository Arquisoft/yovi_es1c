import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { ChatMessage, ChatRepository } from '../repositories/chat.repository.js';
import { AuthVerifyClient } from '../services/AuthVerifyClient.js';

export type ChatMessagePayload = {
  id: number;
  conversationId: number;
  senderUserId: number;
  text: string;
  createdAt: string;
};

export type ChatErrorPayload = {
  code: string;
  message: string;
};

export type ChatRealtimeNotifier = {
  emitMessage(message: ChatMessage): void;
};

type AuthenticatedUser = {
  userId: number;
  username?: string;
};

type ChatSocketData = {
  user?: AuthenticatedUser;
  activeChatRoom?: string;
};

type ChatSocket = Socket & {
  data: ChatSocketData;
};

type JoinPayload = {
  friendUserId?: unknown;
};

type LeavePayload = {
  conversationId?: unknown;
};

const CHAT_SOCKET_PATH = '/api/users/chat/socket.io';

function toPayload(message: ChatMessage): ChatMessagePayload {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    senderUserId: message.sender_user_id,
    text: message.text,
    createdAt: message.created_at,
  };
}

function roomForConversation(conversationId: number): string {
  return `chat:conversation:${conversationId}`;
}

function socketError(socket: ChatSocket, code: string, message: string): void {
  socket.emit('chat:error', { code, message } satisfies ChatErrorPayload);
}

async function authenticateSocket(socket: ChatSocket, next: (error?: Error) => void): Promise<void> {
  try {
    const token = typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : null;
    if (!token) {
      next(new Error('Missing token'));
      return;
    }

    const authServiceUrl = process.env.AUTH_SERVICE_URL;
    if (!authServiceUrl) {
      next(new Error('Authentication service unavailable'));
      return;
    }

    const claims = await new AuthVerifyClient(authServiceUrl).verifyToken(token);
    if (!claims?.sub) {
      next(new Error('Invalid token'));
      return;
    }

    socket.data.user = {
      userId: Number(claims.sub),
      username: claims.username,
    };
    next();
  } catch (error) {
    next(error instanceof Error ? error : new Error('Authentication failure'));
  }
}

export function attachChatSocketServer(server: HttpServer, chatRepo: ChatRepository): ChatRealtimeNotifier {
  const io = new Server(server, {
    path: CHAT_SOCKET_PATH,
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    void authenticateSocket(socket as ChatSocket, next);
  });

  io.on('connection', (socket: Socket) => {
    const chatSocket = socket as ChatSocket;
    const user = chatSocket.data.user;

    if (!user?.userId) {
      chatSocket.disconnect(true);
      return;
    }

    chatSocket.join(`user:${user.userId}`);

    chatSocket.on('chat:join', (payload?: JoinPayload) => {
      void (async () => {
        const friendUserId = Number(payload?.friendUserId);
        if (!Number.isFinite(friendUserId) || friendUserId <= 0) {
          socketError(chatSocket, 'INVALID_FRIEND_USER_ID', 'Invalid friend user id');
          return;
        }

        try {
          const conversationId = await chatRepo.getOrCreateConversationForFriends(user.userId, friendUserId);
          const nextRoom = roomForConversation(conversationId);

          if (chatSocket.data.activeChatRoom && chatSocket.data.activeChatRoom !== nextRoom) {
            await chatSocket.leave(chatSocket.data.activeChatRoom);
          }

          chatSocket.data.activeChatRoom = nextRoom;
          await chatSocket.join(nextRoom);
          chatSocket.emit('chat:joined', { conversationId, friendUserId });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not join chat';
          socketError(chatSocket, 'CHAT_JOIN_FAILED', message);
        }
      })();
    });

    chatSocket.on('chat:leave', (payload?: LeavePayload) => {
      const conversationId = Number(payload?.conversationId);
      const room = Number.isFinite(conversationId) && conversationId > 0
        ? roomForConversation(conversationId)
        : chatSocket.data.activeChatRoom;

      if (room) {
        void chatSocket.leave(room);
      }

      if (!payload?.conversationId || chatSocket.data.activeChatRoom === room) {
        chatSocket.data.activeChatRoom = undefined;
      }
    });
  });

  return {
    emitMessage(message: ChatMessage) {
      io.to(roomForConversation(message.conversation_id)).emit('chat:message', toPayload(message));
    },
  };
}
