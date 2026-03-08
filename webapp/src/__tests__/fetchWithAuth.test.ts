import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { fetchWithAuth } from '../shared/api/fetchWithAuth';
import * as authModule from '../features/auth';

describe('fetchWithAuth', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    // Mock window.location - Fix para TypeScript
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });

    // Mock global fetch con tipo correcto
    global.fetch = vi.fn() as Mock;
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
    vi.unstubAllGlobals();
  });

  it('should add Authorization header when token exists', async () => {
    localStorage.setItem('auth_token', 'test-access-token');

    (global.fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );

    const response = await fetchWithAuth('/api/test', {
      method: 'GET',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
        })
    );

    const callArgs = (global.fetch as Mock).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-access-token');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ data: 'success' });
  });

  it('should make request without Authorization header when no token exists', async () => {
    (global.fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'public' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );

    const response = await fetchWithAuth('/api/public', {
      method: 'GET',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const callArgs = (global.fetch as Mock).mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();

    expect(response.status).toBe(200);
  });

  it('should not retry on non-401 errors', async () => {
    localStorage.setItem('auth_token', 'valid-token');

    (global.fetch as Mock).mockResolvedValueOnce(
        new Response('Server Error', { status: 500 })
    );

    const response = await fetchWithAuth('/api/test', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    expect(response.status).toBe(500);
  });


  it('should preserve custom headers when adding Authorization', async () => {
    localStorage.setItem('auth_token', 'test-token');

    (global.fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), { status: 200 })
    );

    await fetchWithAuth('/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      },
      body: JSON.stringify({ test: 'data' }),
    });

    const callArgs = (global.fetch as Mock).mock.calls[0];
    const headers = callArgs[1].headers as Headers;

    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom-Header')).toBe('custom-value');
  });

  it('should refresh token and retry on 401 response', async () => {
    localStorage.setItem('auth_token', 'expired-token');
    localStorage.setItem('auth_refresh_token', 'valid-refresh-token');

    vi.spyOn(authModule, 'refreshTokens').mockResolvedValueOnce({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      user: { id: 1, username: 'testuser' },
    });

    (global.fetch as Mock)
        .mockResolvedValueOnce(
            new Response('Unauthorized', { status: 401 })
        )
        .mockResolvedValueOnce(
            new Response(JSON.stringify({ data: 'success' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
        );

    const response = await fetchWithAuth('/api/protected', {
      method: 'GET',
    });

    // Solo verificamos que se hizo más de una llamada (original + retry)
    // refreshTokens también puede hacer fetch interno, por eso >= 2
    expect(global.fetch).toHaveBeenCalled();
    const fetchCalls = (global.fetch as Mock).mock.calls;
    expect(fetchCalls.length).toBeGreaterThanOrEqual(2);

    expect(authModule.refreshTokens).toHaveBeenCalledTimes(1);
    expect(authModule.refreshTokens).toHaveBeenCalledWith('valid-refresh-token');

    expect(localStorage.getItem('auth_token')).toBe('new-access-token');
    expect(localStorage.getItem('auth_refresh_token')).toBe('new-refresh-token');

    // Verificar que el retry usó el nuevo token
    const lastCall = fetchCalls[fetchCalls.length - 1];
    const headers = lastCall[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer new-access-token');

    expect(response.status).toBe(200);
  });

  it('should redirect to login when refresh token fails', async () => {
    localStorage.setItem('auth_token', 'expired-token');
    localStorage.setItem('auth_refresh_token', 'invalid-refresh-token');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'test' }));

    // Mock refreshTokens para que falle
    vi.spyOn(authModule, 'refreshTokens').mockRejectedValueOnce(
        new Error('Refresh token expired')
    );

    // Mock fetch para retornar 401
    (global.fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
    );

    try {
      await fetchWithAuth('/api/protected', { method: 'GET' });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Refresh token expired');
    }

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('auth_refresh_token')).toBeNull();
    expect(localStorage.getItem('auth_user')).toBeNull();

    expect(window.location.href).toBe('/login');
  });

  it('should redirect to login when no refresh token available on 401', async () => {
    localStorage.setItem('auth_token', 'expired-token');

    (global.fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
    );

    try {
      await fetchWithAuth('/api/protected', { method: 'GET' });
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('No refresh token available');
    }

    expect(localStorage.getItem('auth_token')).toBeNull();

    expect(window.location.href).toBe('/login');
  });

  it('should handle concurrent 401 requests with single refresh', async () => {
    localStorage.setItem('auth_token', 'expired-token');
    localStorage.setItem('auth_refresh_token', 'valid-refresh-token');

    let refreshCallCount = 0;

    vi.spyOn(authModule, 'refreshTokens').mockImplementation(async () => {
      refreshCallCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user: { id: 1, username: 'testuser' },
      };
    });

    let callIndex = 0;
    (global.fetch as Mock).mockImplementation(() => {
      callIndex++;
      if (callIndex <= 2) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: `success${callIndex}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    });

    const [response1, response2] = await Promise.all([
      fetchWithAuth('/api/test1', { method: 'GET' }),
      fetchWithAuth('/api/test2', { method: 'GET' }),
    ]);

    expect(refreshCallCount).toBe(1);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
  });


});
