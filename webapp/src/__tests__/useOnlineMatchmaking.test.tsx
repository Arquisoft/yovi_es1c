import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnlineMatchmaking } from '../features/game/hooks/useOnlineMatchmaking';
import { onlineSocketClient } from '../features/game/realtime/onlineSocketClient';

describe('useOnlineMatchmaking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.setItem('auth_token', 'token-123');
  });

  it('joinQueue called twice does not duplicate queue:join emissions on connect', async () => {
    const onceHandlers = new Map<string, (payload?: unknown) => void>();
    const socketMock = {
      connected: false,
      once: vi.fn((event: string, handler: (payload?: unknown) => void) => {
        onceHandlers.set(event, handler);
      }),
      off: vi.fn((event: string, handler: (payload?: unknown) => void) => {
        if (onceHandlers.get(event) === handler) onceHandlers.delete(event);
      }),
    } as any;

    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    const emitSpy = vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation(() => () => {});

    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
      await result.current.joinQueue();
    });

    expect(socketMock.off).toHaveBeenCalledWith('connect', expect.any(Function));

    act(() => {
      onceHandlers.get('connect')?.();
    });

    const joinCalls = emitSpy.mock.calls.filter(([event]) => event === 'queue:join');
    expect(joinCalls).toHaveLength(1);
  });

  it('component unmount before connect cleans connect listener', async () => {
    const socketMock = {
      connected: false,
      once: vi.fn(),
      off: vi.fn(),
    } as any;

    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation(() => () => {});

    const { result } = renderHook(() => useOnlineMatchmaking(8));

    let cleanup: (() => void) | undefined;
    await act(async () => {
      cleanup = await result.current.joinQueue();
    });

    expect(cleanup).toBeTypeOf('function');

    act(() => {
      cleanup?.();
    });

    expect(socketMock.off).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('after 30 seconds without match triggers bot fallback', async () => {
    const socketMock = { connected: true, once: vi.fn(), off: vi.fn() } as any;
    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    const emitSpy = vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation(() => () => {});

    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
    });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.matched?.matchId).toBe('__BOT_FALLBACK__');
    expect(emitSpy).toHaveBeenCalledWith('queue:cancel');
  });

  it('cancels fallback timer when real match event arrives', async () => {
    const handlers = new Map<string, (payload: any) => void>();
    const socketMock = { connected: true, once: vi.fn(), off: vi.fn() } as any;
    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation((event, handler) => {
      handlers.set(event, handler as any);
      return () => {};
    });

    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
    });

    act(() => {
      handlers.get('matchmaking:matched')?.({
        matchId: 'real-1',
        opponentPublic: { username: 'alice' },
        revealAfterGame: false,
      });
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.matched?.matchId).toBe('real-1');
    expect(result.current.matched?.matchId).not.toBe('__BOT_FALLBACK__');
  });

  it('does not disconnect socket on unmount when match already found', async () => {
    const handlers = new Map<string, (payload: any) => void>();
    const socketMock = { connected: true, once: vi.fn(), off: vi.fn() } as any;
    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);
    const disconnectSpy = vi.spyOn(onlineSocketClient, 'disconnect').mockImplementation(() => undefined);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation((event, handler) => {
      handlers.set(event, handler as any);
      return () => {};
    });

    const { result, unmount } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
    });

    act(() => {
      handlers.get('matchmaking:matched')?.({
        matchId: 'real-2',
        opponentPublic: { username: 'bob' },
        revealAfterGame: true,
      });
    });

    unmount();

    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it('returns auth error when token is missing', async () => {
    localStorage.removeItem('auth_token');
    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
    });

    expect(result.current.error).toContain('Not authenticated');
  });

  it('registers connect listener when socket starts disconnected', async () => {
    const socketMock = { connected: false, once: vi.fn(), off: vi.fn() } as any;
    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation(() => () => {});
    vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);

    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
    });

    expect(socketMock.once).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('updates waiting from queue:status and exposes connect_error', async () => {
    const handlers = new Map<string, (payload: any) => void>();
    const socketMock = { connected: true, once: vi.fn(), off: vi.fn() } as any;
    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation((event, handler) => {
      handlers.set(event, handler as any);
      return () => {};
    });

    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
    });

    act(() => {
      handlers.get('queue:status')?.({ state: 'queued', waitedSec: 0 });
    });
    expect(result.current.waiting).toBe(true);

    act(() => {
      handlers.get('connect_error')?.(new Error('socket down'));
    });

    expect(result.current.error).toBe('socket down');
    expect(result.current.waiting).toBe(false);
  });
  it('keeps joinQueue reference stable across rerenders with same board size', () => {
    const { result, rerender } = renderHook(({ size }) => useOnlineMatchmaking(size), {
      initialProps: { size: 8 },
    });

    const firstJoinQueue = result.current.joinQueue;
    rerender({ size: 8 });

    expect(result.current.joinQueue).toBe(firstJoinQueue);
  });

  it('cancelQueue resets wait counter and waiting state', async () => {
    const socketMock = { connected: true, once: vi.fn(), off: vi.fn() } as any;
    vi.spyOn(onlineSocketClient, 'connect').mockReturnValue(socketMock);
    vi.spyOn(onlineSocketClient, 'on').mockImplementation(() => () => {});
    vi.spyOn(onlineSocketClient, 'emit').mockImplementation(() => undefined);

    const { result } = renderHook(() => useOnlineMatchmaking(8));

    await act(async () => {
      await result.current.joinQueue();
      vi.advanceTimersByTime(2_000);
      await result.current.cancelQueue();
    });

    expect(result.current.waiting).toBe(false);
    expect(result.current.waitedSec).toBe(0);
  });

});