import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useOnlineSession } from '../features/game/hooks/useOnlineSession';

type Handler = (payload?: unknown) => void;
const handlers = new Map<string, Handler>();

const socketMock = {
  connected: true,
  on: vi.fn((event: string, cb: Handler) => handlers.set(event, cb)),
  off: vi.fn((event: string) => handlers.delete(event)),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socketMock),
}));

describe('useOnlineSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    localStorage.clear();
    localStorage.setItem('auth_token', 'token');
    localStorage.setItem('auth_refresh_token', 'refresh');
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch;
  });

  it('receives session state and sends move payload', async () => {
    const { result } = renderHook(() => useOnlineSession('m1'));

    await waitFor(() => {
      expect(socketMock.on).toHaveBeenCalled();
    });

    act(() => {
      handlers.get('session:state')?.({
        matchId: 'm1',
        layout: '. /..',
        turn: 0,
        version: 2,
        timerEndsAt: Date.now() + 1000,
        connectionStatus: 'CONNECTED',
      });
    });

    expect(result.current.sessionState?.version).toBe(2);

    act(() => {
      result.current.playMove(0, 0);
    });

    expect(socketMock.emit).toHaveBeenNthCalledWith(2, 'move:play', {
      matchId: 'm1',
      move: { row: 0, col: 0 },
      expectedVersion: 2,
      clientEventId: expect.any(String),
    });
  });

  it('sets error when there is no auth token', () => {
    localStorage.removeItem('auth_token');
    const { result } = renderHook(() => useOnlineSession('m1'));
    expect(result.current.error?.message).toBe('Missing auth token');
  });

  it('ignores session:state events from another match', async () => {
    const { result } = renderHook(() => useOnlineSession('m1'));
    await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

    act(() => {
      handlers.get('session:state')?.({
        matchId: 'm2',
        layout: '. /..',
        turn: 0,
        version: 5,
        timerEndsAt: Date.now() + 1000,
      });
    });

    expect(result.current.sessionState).toBeNull();
  });

  it('updates existing state when receiving successive session events', async () => {
    const { result } = renderHook(() => useOnlineSession('m1'));
    await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

    act(() => {
      handlers.get('session:state')?.({
        matchId: 'm1',
        layout: '. /..',
        turn: 0,
        version: 1,
        timerEndsAt: Date.now() + 1000,
      });
    });

    act(() => {
      handlers.get('session:state')?.({
        matchId: 'm1',
        layout: 'B/..',
        turn: 1,
        version: 2,
        timerEndsAt: Date.now() + 2000,
      });
    });

    expect(result.current.sessionState?.layout).toBe('B/..');
    expect(result.current.sessionState?.version).toBe(2);
  });

  it('returns disconnected fallback status when no matchId is provided', () => {
    const { result } = renderHook(() => useOnlineSession(null));
    expect(result.current.connectionStatus).toBe('RECONNECTING');
  });
});
