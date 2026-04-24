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
});
