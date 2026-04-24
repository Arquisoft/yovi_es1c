import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthVerifyClient, AuthVerifyError } from '../src/services/AuthVerifyClient.js';

describe('users AuthVerifyClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns null for malformed authorization headers without calling auth service', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never).mockResolvedValue(new Response(null, { status: 200 }));
    const client = new AuthVerifyClient('http://auth.local');

    await expect(client.verifyAuthorizationHeader('Token abc')).resolves.toBeNull();
    await expect(client.verifyAuthorizationHeader('Bearer too many parts')).resolves.toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when auth service response has no valid subject claim', async () => {
    vi.spyOn(globalThis, 'fetch' as never).mockResolvedValue(
      new Response(JSON.stringify({ valid: true, claims: { username: 'alice' } }), { status: 200 }),
    );

    const client = new AuthVerifyClient('http://auth.local');

    await expect(client.verifyAuthorizationHeader('Bearer missing-sub')).resolves.toBeNull();
  });

  it('throws AUTH_TIMEOUT when auth verification aborts', async () => {
    vi.spyOn(globalThis, 'fetch' as never).mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const client = new AuthVerifyClient('http://auth.local');

    await expect(client.verifyAuthorizationHeader('Bearer timeout-token')).rejects.toMatchObject({
      code: 'AUTH_TIMEOUT',
    } satisfies Partial<AuthVerifyError>);
  });

  it('evicts expired cached entries before retrying verification', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never).mockImplementation(async () =>
      new Response(JSON.stringify({ valid: true, claims: { sub: '9', exp: Math.floor(Date.now() / 1000) + 60 } }), { status: 200 }),
    );

    const client = new AuthVerifyClient('http://auth.local', 5, 1_000);
    await expect(client.verifyAuthorizationHeader('Bearer cached-token')).resolves.toMatchObject({ sub: '9' });

    await vi.advanceTimersByTimeAsync(6);
    await expect(client.verifyAuthorizationHeader('Bearer cached-token')).resolves.toMatchObject({ sub: '9' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws AUTH_UNAVAILABLE when auth service returns 5xx', async () => {
    vi.spyOn(globalThis, 'fetch' as never).mockResolvedValue(new Response(JSON.stringify({ error: 'down' }), { status: 503 }));

    const client = new AuthVerifyClient('http://auth.local');

    await expect(client.verifyAuthorizationHeader('Bearer down-token')).rejects.toMatchObject({
      code: 'AUTH_UNAVAILABLE',
    } satisfies Partial<AuthVerifyError>);
  });
});
