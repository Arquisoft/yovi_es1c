import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineSessionError } from '../src/services/OnlineSessionService';
import { socketServerInternals } from '../src/realtime/socketServer';

describe('socketServer internals', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    socketServerInternals.resetForTests();
    delete process.env.AUTH_SERVICE_URL;
  });

  it('verifySocketToken throws when AUTH_SERVICE_URL is missing', async () => {
    await expect(socketServerInternals.verifySocketToken('token')).rejects.toThrow(
        'AUTH_SERVICE_URL is not configured',
    );
  });

  it('verifySocketToken builds a fallback username when claims omit it', async () => {
    process.env.AUTH_SERVICE_URL = 'http://auth.local';
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ valid: true, claims: { sub: '12' } }), { status: 200 })),
    );

    await expect(socketServerInternals.verifySocketToken('good-token')).resolves.toEqual({
      userId: 12,
      username: 'user-12',
    });
  });

  it('verifySocketToken returns null when subject is not numeric', async () => {
    process.env.AUTH_SERVICE_URL = 'http://auth.local';
    vi.stubGlobal(
        'fetch',
        vi.fn(
            async () =>
                new Response(JSON.stringify({ valid: true, claims: { sub: 'abc', username: 'alice' } }), { status: 200 }),
        ),
    );

    await expect(socketServerInternals.verifySocketToken('bad-sub')).resolves.toBeNull();
  });

  it('safeAsync emits session:error for OnlineSessionError', async () => {
    const socket = {
      emit: vi.fn(),
    } as any;

    const handler = socketServerInternals.safeAsync(socket, async () => {
      throw new OnlineSessionError('INVALID_MOVE', 'invalid');
    });

    handler(undefined as never);
    await Promise.resolve();

    expect(socket.emit).toHaveBeenCalledWith('session:error', {
      code: 'INVALID_MOVE',
      message: 'invalid',
    });
  });
  it('safeAsync handles generic Error', async () => {
    const socket = { emit: vi.fn() } as any;

    const handler = socketServerInternals.safeAsync(socket, async () => {
      throw new Error('boom');
    });

    handler(undefined as never);
    await Promise.resolve();

    expect(socket.emit).toHaveBeenCalledWith('session:error', {
      code: 'INTERNAL_ERROR',
      message: 'boom',
    });
  });
  describe('socketServer internals extra coverage', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      socketServerInternals.resetForTests();
      delete process.env.AUTH_SERVICE_URL;
    });

    it('verifySocketToken returns null when claims are missing sub', async () => {
      process.env.AUTH_SERVICE_URL = 'http://auth.local';

      vi.stubGlobal(
          'fetch',
          vi.fn(async () =>
              new Response(JSON.stringify({ valid: true, claims: {} }), { status: 200 }),
          ),
      );

      await expect(socketServerInternals.verifySocketToken('token')).resolves.toBeNull();
    });

    it('verifySocketToken returns null when sub is NaN', async () => {
      process.env.AUTH_SERVICE_URL = 'http://auth.local';

      vi.stubGlobal(
          'fetch',
          vi.fn(async () =>
              new Response(JSON.stringify({ valid: true, claims: { sub: 'not-a-number' } }), { status: 200 }),
          ),
      );

      await expect(socketServerInternals.verifySocketToken('token')).resolves.toBeNull();
    });

    it('verifySocketToken uses fallback username when username is missing', async () => {
      process.env.AUTH_SERVICE_URL = 'http://auth.local';

      vi.stubGlobal(
          'fetch',
          vi.fn(async () =>
              new Response(JSON.stringify({ valid: true, claims: { sub: '42' } }), { status: 200 }),
          ),
      );

      await expect(socketServerInternals.verifySocketToken('token')).resolves.toEqual({
        userId: 42,
        username: 'user-42',
      });
    });

    it('safeAsync handles thrown string error', async () => {
      const socket = { emit: vi.fn() } as any;

      const handler = socketServerInternals.safeAsync(socket, async () => {
        // @ts-ignore
        throw 'boom-string';
      });

      handler(undefined as never);
      await Promise.resolve();

      expect(socket.emit).toHaveBeenCalledWith('session:error', {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error',
      });
    });

    it('safeAsync handles object error with code', async () => {
      const socket = { emit: vi.fn() } as any;

      const handler = socketServerInternals.safeAsync(socket, async () => {
        throw { code: 'CUSTOM_CODE', message: 'fail' };
      });

      handler(undefined as never);
      await Promise.resolve();

      expect(socket.emit).toHaveBeenCalledWith('session:error', {
        code: 'CUSTOM_CODE',
        message: 'Unexpected server error',
      });
    });

    it('createRedisBridge proxies calls correctly', async () => {
      const client = {
        zAdd: vi.fn().mockResolvedValue(1),
        zRem: vi.fn().mockResolvedValue(1),
        zRange: vi.fn().mockResolvedValue(['a']),
        hSet: vi.fn().mockResolvedValue(1),
        hGetAll: vi.fn().mockResolvedValue({}),
        del: vi.fn().mockResolvedValue(1),
        eval: vi.fn().mockResolvedValue(1),
        set: vi.fn().mockResolvedValue('OK'),
        get: vi.fn().mockResolvedValue('value'),
      };

      const bridge = socketServerInternals.createRedisBridge(client as any);

      await bridge.zAdd('k', []);
      await bridge.zRem('k', ['a']);
      await bridge.zRange('k', 0, 1);
      await bridge.hSet('k', {});
      await bridge.hGetAll('k');
      await bridge.del('k');
      await bridge.eval('script', { keys: [], arguments: [] });
      await bridge.set('k', 'v');
      await bridge.get('k');

      expect(client.zAdd).toHaveBeenCalled();
      expect(client.get).toHaveBeenCalledWith('k');
    });
  });
});

describe('rematch handler logic via safeAsync', () => {
  it('rematch:request – calls sessionService.requestRematch and does not emit error on success', async () => {
    const socket = { emit: vi.fn(), join: vi.fn(), data: {} } as any;
    const sessionService = { requestRematch: vi.fn().mockResolvedValue(undefined) };
    const user = { userId: 7, username: 'alice' };

    const handler = socketServerInternals.safeAsync(socket, async (payload: { matchId: string } | undefined) => {
      if (!payload) return;
      await sessionService.requestRematch(payload.matchId, user.userId);
    });

    handler({ matchId: 'match-1' });
    await Promise.resolve();

    expect(sessionService.requestRematch).toHaveBeenCalledWith('match-1', 7);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('rematch:request – emits session:error when sessionService throws OnlineSessionError', async () => {
    const socket = { emit: vi.fn(), join: vi.fn(), data: {} } as any;
    const sessionService = {
      requestRematch: vi.fn().mockRejectedValue(new OnlineSessionError('SESSION_NOT_FOUND', 'not found')),
    };
    const user = { userId: 7, username: 'alice' };

    const handler = socketServerInternals.safeAsync(socket, async (payload: { matchId: string } | undefined) => {
      if (!payload) return;
      await sessionService.requestRematch(payload.matchId, user.userId);
    });

    handler({ matchId: 'match-1' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(socket.emit).toHaveBeenCalledWith('session:error', {
      code: 'SESSION_NOT_FOUND',
      message: 'not found',
    });
  });

  it('rematch:request – does nothing when payload is undefined', async () => {
    const socket = { emit: vi.fn(), join: vi.fn(), data: {} } as any;
    const sessionService = { requestRematch: vi.fn() };
    const user = { userId: 7, username: 'alice' };

    const handler = socketServerInternals.safeAsync(socket, async (payload: { matchId: string } | undefined) => {
      if (!payload) return;
      await sessionService.requestRematch(payload.matchId, user.userId);
    });

    handler(undefined as any);
    await Promise.resolve();

    expect(sessionService.requestRematch).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('rematch:accept – calls sessionService.acceptRematch and joins the new room', async () => {
    const newMatchId = 'new-match-99';
    const socket = { emit: vi.fn(), join: vi.fn(), data: {} as Record<string, string> } as any;
    const sessionService = { acceptRematch: vi.fn().mockResolvedValue(newMatchId) };
    const user = { userId: 8, username: 'bob' };

    const handler = socketServerInternals.safeAsync(socket, async (payload: { matchId: string } | undefined) => {
      if (!payload) return;
      const id = await sessionService.acceptRematch(payload.matchId, user.userId);
      socket.join(id);
      socket.data.activeMatchId = id;
    });

    handler({ matchId: 'match-1' });
    await Promise.resolve();

    expect(sessionService.acceptRematch).toHaveBeenCalledWith('match-1', 8);
    expect(socket.join).toHaveBeenCalledWith(newMatchId);
    expect(socket.data.activeMatchId).toBe(newMatchId);
  });

  it('rematch:accept – emits session:error on OnlineSessionError', async () => {
    const socket = { emit: vi.fn(), join: vi.fn(), data: {} } as any;
    const sessionService = {
      acceptRematch: vi.fn().mockRejectedValue(new OnlineSessionError('UNAUTHORIZED', 'cannot accept own request')),
    };
    const user = { userId: 8, username: 'bob' };

    const handler = socketServerInternals.safeAsync(socket, async (payload: { matchId: string } | undefined) => {
      if (!payload) return;
      const id = await sessionService.acceptRematch(payload.matchId, user.userId);
      socket.join(id);
      socket.data.activeMatchId = id;
    });

    handler({ matchId: 'match-1' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(socket.emit).toHaveBeenCalledWith('session:error', {
      code: 'UNAUTHORIZED',
      message: 'cannot accept own request',
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rematch:decline – calls sessionService.declineRematch and does not emit error on success', async () => {
    const socket = { emit: vi.fn(), data: {} } as any;
    const sessionService = { declineRematch: vi.fn().mockResolvedValue(undefined) };
    const user = { userId: 9, username: 'carol' };

    const handler = socketServerInternals.safeAsync(socket, async (payload: { matchId: string } | undefined) => {
      if (!payload) return;
      await sessionService.declineRematch(payload.matchId, user.userId);
    });

    handler({ matchId: 'match-1' });
    await Promise.resolve();

    expect(sessionService.declineRematch).toHaveBeenCalledWith('match-1', 9);
    expect(socket.emit).not.toHaveBeenCalled();
  });
});