import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOnlineMatchmaking } from '../features/game/hooks/useOnlineMatchmaking';
import { onlineSocketClient } from '../features/game/realtime/onlineSocketClient';

describe('useOnlineMatchmaking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('auth_token', 'token');
    localStorage.setItem('auth_refresh_token', 'refresh');
  });

  it('joins queue and sets matched payload', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const socketMock = {
      connected: true,
      once: vi.fn(),
    } as unknown as ReturnType<typeof onlineSocketClient.connect>;

    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);
    vi.spyOn(onlineSocketClient, 'disconnect').mockImplementation(() => undefined);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation((event, handler) => {
      handlers.set(event, handler as (payload: unknown) => void);
      return () => {};
    });

    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
    });

    act(() => {
      handlers.get('matchmaking:matched')?.({
        matchId: 'online-1',
        opponentPublic: { username: 'u2' },
        revealAfterGame: false,
      });
    });

    expect(result.current.matched?.matchId).toBe('online-1');
    expect(result.current.matched?.opponent).toBe('u2');
  });

  it('returns authentication error when token is missing', async () => {
    localStorage.removeItem('auth_token');
    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
    });

    expect(result.current.error).toContain('Not authenticated');
  });
});
