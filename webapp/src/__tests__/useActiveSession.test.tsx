import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider } from '../features/auth';
import { useActiveSession } from '../features/game/hooks/useActiveSession';
import { fetchWithAuth } from '../shared/api/fetchWithAuth';

vi.mock('../shared/api/fetchWithAuth', () => ({
  fetchWithAuth: vi.fn(),
}));

describe('useActiveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('auth_token', 'token');
    localStorage.setItem('auth_refresh_token', 'refresh');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'u1' }));
  });

  it('returns active session when API responds 200', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(
      new Response(JSON.stringify({ matchId: 'm-1', boardSize: 8 }), { status: 200 }),
    );

    const { result } = renderHook(() => useActiveSession(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.matchId).toBe('m-1');
    expect(result.current.boardSize).toBe(8);
    expect(result.current.error).toBeNull();
  });

  it('returns null session when API responds 204', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useActiveSession(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.matchId).toBeNull();
    expect(result.current.boardSize).toBeNull();
  });

  it('returns error on network failure', async () => {
    vi.mocked(fetchWithAuth).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useActiveSession(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
  });

  it('keeps null state when user is not authenticated', async () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_refresh_token');

    const { result } = renderHook(() => useActiveSession(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    expect(result.current.matchId).toBeNull();
    expect(result.current.boardSize).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns error when API responds with non-success status', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(null, { status: 500 }));
    const { result } = renderHook(() => useActiveSession(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('No se pudo comprobar la sesión activa');
  });

  it('returns generic network error for unknown failures', async () => {
    vi.mocked(fetchWithAuth).mockRejectedValue('unknown');
    const { result } = renderHook(() => useActiveSession(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Error de red');
  });
});
