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
