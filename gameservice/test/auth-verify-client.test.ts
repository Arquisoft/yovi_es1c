import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthVerifyClient, AuthVerifyError } from '../src/services/AuthVerifyClient';

describe('AuthVerifyClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses cache on repeated verify for same token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
      new Response(JSON.stringify({ valid: true, claims: { sub: '1', username: 'u1', exp: Math.floor(Date.now() / 1000) + 60 } }), { status: 200 }),
    );

    const client = new AuthVerifyClient('http://auth.local', 10_000, 1_000);
    const first = await client.verifyAuthorizationHeader('Bearer token-1');
    const second = await client.verifyAuthorizationHeader('Bearer token-1');

    expect(first?.sub).toBe('1');
    expect(second?.sub).toBe('1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for invalid token response', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(new Response(JSON.stringify({ valid: false }), { status: 401 }));

    const client = new AuthVerifyClient('http://auth.local');
    const claims = await client.verifyAuthorizationHeader('Bearer token-2');

    expect(claims).toBeNull();
  });

  it('throws AUTH_UNAVAILABLE on auth service 5xx', async () => {
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(new Response(JSON.stringify({ error: 'down' }), { status: 503 }));

    const client = new AuthVerifyClient('http://auth.local');
    await expect(client.verifyAuthorizationHeader('Bearer token-3')).rejects.toBeInstanceOf(AuthVerifyError);
  });
});
