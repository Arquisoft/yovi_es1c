import { Server as HttpServer } from 'http';
import { MatchmakingService, RedisCommandClient, SocketEmitter as MatchSocketEmitter } from '../services/MatchmakingService';
import { OnlineSessionService, RedisSessionClient } from '../services/OnlineSessionService';
import { MatchmakingRepository } from '../repositories/MatchmakingRepository';
import { BotFallbackService } from '../services/BotFallbackService';
import { StatsService } from '../services/StatsService';
import { OnlineSessionRepository } from '../repositories/OnlineSessionRepository';
import { TurnTimerService as TurnTimerSvc } from '../services/TurnTimerService';
import { MovePayload } from '../types/online';

interface AuthClaims {
  sub: string;
  username?: string;
}

interface AuthResult {
  valid: boolean;
  claims?: AuthClaims;
}

interface AuthenticatedUser {
  userId: number;
  username: string;
}

interface QueueJoinPayload {
  boardSize: number;
}

interface MatchJoinPayload {
  matchId: string;
}

interface ChatMessagePayload {
  matchId: string;
  text: string;
}

interface SocketData {
  user?: AuthenticatedUser;
  activeMatchId?: string;
}

interface SocketLike {
  id: string;
  handshake: { auth: { token?: unknown } };
  data: SocketData;
  join(room: string): void;
  emit(event: string, payload: unknown): void;
  disconnect(close?: boolean): void;
  on(event: string, handler: (payload?: never) => void | Promise<void>): void;
}

interface IoLike extends MatchSocketEmitter {
  adapter(adapter: unknown): void;
  use(handler: (socket: SocketLike, next: (error?: Error) => void) => void | Promise<void>): void;
  on(event: 'connection', handler: (socket: SocketLike) => void): void;
}

interface RedisClientLike {
  connect(): Promise<void>;
  duplicate(): RedisClientLike;
  zAdd(key: string, members: { score: number; value: string }[]): Promise<number>;
  zRem(key: string, members: string[]): Promise<number>;
  zRange(key: string, start: number, stop: number): Promise<string[]>;
  hSet(key: string, values: Record<string, string>): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  del(key: string): Promise<number>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<number>;
  set(key: string, value: string): Promise<string | null>;
  get(key: string): Promise<string | null>;
  scan(cursor: number, options: { MATCH: string; COUNT: number }): Promise<{ cursor: number; keys: string[] }>;
}

interface SocketIoConstructor {
  new (server: HttpServer, options: { cors: { origin: string; methods: string[] } }): IoLike;
}

interface RedisFactory {
  createClient(options: { url: string }): RedisClientLike;
}

interface RedisAdapterFactory {
  createAdapter(pubClient: RedisClientLike, subClient: RedisClientLike): unknown;
}

interface RealtimeServiceBundle {
  matchmakingService: MatchmakingService;
  onlineSessionService: OnlineSessionService;
}

interface AttachSocketDeps {
  statsService: StatsService;
}

let ioSingleton: IoLike | null = null;
let realtimeServices: RealtimeServiceBundle | null = null;

// ─── UTILITY: wraps async socket handlers to prevent UnhandledPromiseRejection ───
function safeAsync<T>(
    socket: SocketLike,
    fn: (payload: T) => Promise<void>,
    errorEventName = 'session:error',
): (payload: T) => void {
  return (payload: T) => {
    fn(payload).catch((err: unknown) => {
      console.error('[socket] Unhandled async error:', err);
      const message = err instanceof Error ? err.message : 'Unexpected server error';
      const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
      socket.emit(errorEventName, { code, message });
    });
  };
}

export async function attachSocketServer(server: HttpServer, deps: AttachSocketDeps): Promise<RealtimeServiceBundle | null> {
  if (realtimeServices) return realtimeServices;
  if (ioSingleton) return null;

  let Server: SocketIoConstructor;
  let redisFactory: RedisFactory;
  let redisAdapterFactory: RedisAdapterFactory;

  try {
    ({ Server } = require('socket.io') as { Server: SocketIoConstructor });
    redisFactory = require('redis') as RedisFactory;
    redisAdapterFactory = require('@socket.io/redis-adapter') as RedisAdapterFactory;
  } catch (error) {
    console.warn('[realtime] Socket.IO or Redis adapter unavailable; realtime disabled.', error);
    return null;
  }

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const pubClient = redisFactory.createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
  } catch (error) {
    console.warn('[realtime] Redis unavailable; realtime disabled.', error);
    return null;
  }

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.adapter(redisAdapterFactory.createAdapter(pubClient, subClient));

  const redisBridge = createRedisBridge(pubClient);

  const matchmakingService = new MatchmakingService(
      new MatchmakingRepository(),
      deps.statsService,
      new BotFallbackService(),
      Number(process.env.MM_TIMEOUT_SEC ?? 30),
      { redis: redisBridge, io },
  );

  const sessionService = new OnlineSessionService(
      new OnlineSessionRepository(),
      new TurnTimerSvc(),
      Number(process.env.TURN_TIMEOUT_SEC ?? 25),
      Number(process.env.RECONNECT_GRACE_SEC ?? 60),
      { redis: redisBridge, io },
  );

  matchmakingService.startWorker();

  io.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : null;
      if (!token) {
        next(new Error('Missing token'));
        return;
      }

      const authUser = await verifySocketToken(token);
      if (!authUser) {
        next(new Error('Invalid token'));
        return;
      }

      socket.data.user = authUser;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('Authentication failure'));
    }
  });

  io.on('connection', (socket: SocketLike) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${user.userId}`);

    socket.on(
        'queue:join',
        safeAsync<QueueJoinPayload | undefined>(socket, async (payload) => {
          if (!payload) return;
          await matchmakingService.joinQueue({
            userId: user.userId,
            username: user.username,
            boardSize: payload.boardSize,
            socketId: socket.id,
          });
          socket.emit('queue:status', { state: 'queued', waitedSec: 0 });
        }),
    );

    socket.on(
        'queue:cancel',
        safeAsync<undefined>(socket, async () => {
          await matchmakingService.cancelQueue(user.userId);
          socket.emit('queue:status', { state: 'searching', waitedSec: 0 });
        }),
    );

    socket.on(
        'match:join',
        safeAsync<MatchJoinPayload | undefined>(socket, async (payload) => {
          if (!payload) return;

          const state = await sessionService.reconnect(payload.matchId, user.userId);
          if (!state) {
            socket.emit('session:error', {
              matchId: payload.matchId,
              code: 'SESSION_NOT_FOUND',
              message: 'Session not found',
            });
            return;
          }

          socket.join(payload.matchId);
          socket.data.activeMatchId = payload.matchId;
          socket.emit('session:state', {
            matchId: state.matchId,
            layout: state.layout,
            size: state.size,
            turn: state.turn,
            version: state.version,
            timerEndsAt: state.timerEndsAt,
            players: state.players,
            winner: state.winner,
            connectionStatus: state.connection[user.userId] ?? 'CONNECTED',
            messages: state.messages,
          });
        }),
    );

    socket.on(
        'move:play',
        safeAsync<MovePayload | undefined>(socket, async (payload) => {
          if (!payload) return;
          await sessionService.handleMove(
              payload.matchId,
              user.userId,
              payload.move,
              payload.expectedVersion,
          );
        }),
    );
    socket.on(
        'turn:timeout',
        safeAsync<{ matchId: string; version: number } | undefined>(socket, async (payload) => {
          if (!payload) return;

          const state = await sessionService.getSnapshot(payload.matchId);
          if (!state) return;
          if (state.winner) return;
          if (state.version !== payload.version) return;

          const currentPlayer = state.players[state.turn];
          if (currentPlayer.userId !== user.userId) return;

          await sessionService.handleTurnTimeout(payload.matchId, user.userId, payload.version);
        }),
    );

    socket.on(
        'chat:message',
        safeAsync<ChatMessagePayload | undefined>(socket, async (payload) => {
          if (!payload) return;
          await sessionService.addChatMessage(payload.matchId, user.userId, user.username, payload.text);
        }),
    );

    socket.on(
        'disconnect',
        safeAsync<undefined>(socket, async () => {
          await matchmakingService.cancelQueue(user.userId);

          // Primero intenta con el activeMatchId del socket
          if (socket.data.activeMatchId) {
            await sessionService.markDisconnected(socket.data.activeMatchId, user.userId);
            return;
          }

          // Fallback: busca en Redis si hay sesión activa para este usuario
          const active = await sessionService.getActiveSessionForUser(user.userId);
          if (active) {
            await sessionService.markDisconnected(active.matchId, user.userId);
          }
        }),
    );

  });

  ioSingleton = io;
  realtimeServices = {
    matchmakingService,
    onlineSessionService: sessionService,
  };

  return realtimeServices;
}

function createRedisBridge(client: RedisClientLike): RedisCommandClient & RedisSessionClient {
  return {
    zAdd: (key, members) => client.zAdd(key, members),
    zRem: (key, members) => client.zRem(key, members),
    zRange: (key, start, stop) => client.zRange(key, start, stop),
    hSet: (key, values) => client.hSet(key, values),
    hGetAll: (key) => client.hGetAll(key),
    del: (key) => client.del(key),
    eval: (script, options) => client.eval(script, options),
    set: (key, value) => client.set(key, value),
    get: (key) => client.get(key),
    scan: (cursor, options) => client.scan(cursor, options),
  };
}

async function verifySocketToken(token: string): Promise<AuthenticatedUser | null> {
  const authServiceUrl = process.env.AUTH_SERVICE_URL;
  if (!authServiceUrl) {
    throw new Error('AUTH_SERVICE_URL is not configured');
  }

  const response = await fetch(`${authServiceUrl}/api/auth/verify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as AuthResult;
  if (!payload.valid || !payload.claims?.sub) return null;

  const userId = Number(payload.claims.sub);
  if (!Number.isFinite(userId)) return null;

  return {
    userId,
    username: payload.claims.username ?? `user-${payload.claims.sub}`,
  };
}
