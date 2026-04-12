import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
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

const fetchMock = vi.fn();

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

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('receives session state and sends move payload', async () => {
    const { result } = renderHook(() => useOnlineSession('m1'));

    await waitFor(() => {
      expect(socketMock.on).toHaveBeenCalled();
    });

    await act(async () => {
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

    await act(async () => {
      await result.current.playMove(0, 0);
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

    await act(async () => {
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

    await act(async () => {
      handlers.get('session:state')?.({
        matchId: 'm1',
        layout: '. /..',
        turn: 0,
        version: 1,
        timerEndsAt: Date.now() + 1000,
      });
    });

    await act(async () => {
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

  it('sets error on session:error socket event', async () => {
    const { result } = renderHook(() => useOnlineSession('m1'));
    await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

    await act(async () => {
      handlers.get('session:error')?.({
        code: 'NOT_YOUR_TURN',
        message: 'Wait your turn',
      });
    });

    expect(result.current.error?.message).toBe('Wait your turn');
  });

  it('playMove does nothing when there is a winner', async () => {
    const { result } = renderHook(() => useOnlineSession('m1'));
    await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

    await act(async () => {
      handlers.get('session:state')?.({
        matchId: 'm1',
        layout: 'B/..',
        turn: 0,
        version: 3,
        timerEndsAt: Date.now() + 1000,
        winner: 'B',
      });
    });

    await act(async () => {
      await result.current.playMove(1, 2);
    });

    expect(socketMock.emit).not.toHaveBeenCalledWith('move:play', expect.anything());
  });

  describe('errores recuperables (VERSION_CONFLICT, NOT_YOUR_TURN, DUPLICATE_EVENT)', () => {
    it('VERSION_CONFLICT: establece el error pero NO marca isTerminalError', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'VERSION_CONFLICT',
          message: 'Version mismatch',
        });
      });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');
      expect(result.current.isTerminalError).toBe(false);
    });

    it('VERSION_CONFLICT: el error se auto-limpia pasados 3 segundos', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      vi.useFakeTimers();

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'VERSION_CONFLICT',
          message: 'Version mismatch',
        });
      });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.error).toBeNull();
    });

    it('VERSION_CONFLICT: triggers snapshot resync fetch', async () => {
      fetchMock
          .mockResolvedValueOnce(new Response(JSON.stringify({
            matchId: 'm1',
            layout: 'B/..',
            size: 3,
            rules: {
              pieRule: { enabled: false },
              honey: { enabled: false, blockedCells: [] },
            },
            turn: 1,
            version: 1,
            timerEndsAt: Date.now() + 1000,
            players: [
              { userId: 1, username: 'a', symbol: 'B' },
              { userId: 2, username: 'b', symbol: 'R' },
            ],
            winner: null,
          }), { status: 200 }))
          .mockResolvedValueOnce(new Response(JSON.stringify({
            matchId: 'm1',
            layout: 'B/R.',
            size: 3,
            rules: {
              pieRule: { enabled: false },
              honey: { enabled: false, blockedCells: [] },
            },
            turn: 0,
            version: 2,
            timerEndsAt: Date.now() + 2000,
            players: [
              { userId: 1, username: 'a', symbol: 'B' },
              { userId: 2, username: 'b', symbol: 'R' },
            ],
            winner: null,
          }), { status: 200 }));

      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'VERSION_CONFLICT',
          message: 'Version mismatch',
        });
      });

      await waitFor(() => expect(result.current.sessionState?.version).toBe(2));
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('NOT_YOUR_TURN: se auto-limpia pasados 3 segundos', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      vi.useFakeTimers();

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'NOT_YOUR_TURN',
          message: 'Wait your turn',
        });
      });

      expect(result.current.error?.code).toBe('NOT_YOUR_TURN');

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.error).toBeNull();
    });

    it('DUPLICATE_EVENT: se auto-limpia pasados 3 segundos', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      vi.useFakeTimers();

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'DUPLICATE_EVENT',
          message: 'Already processed',
        });
      });

      expect(result.current.error?.code).toBe('DUPLICATE_EVENT');

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.error).toBeNull();
    });

    it('error recuperable NO se limpia antes de los 3 segundos', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      vi.useFakeTimers();

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'VERSION_CONFLICT',
          message: 'Version mismatch',
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');
    });

    it('playMove limpia un error recuperable previo antes de emitir', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      await act(async () => {
        handlers.get('session:state')?.({
          matchId: 'm1',
          layout: 'B/..',
          turn: 1,
          version: 3,
          timerEndsAt: Date.now() + 5000,
        });
      });

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'VERSION_CONFLICT',
          message: 'Version mismatch',
        });
      });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');

      await act(async () => {
        await result.current.playMove(1, 0);
      });

      expect(result.current.error).toBeNull();
      expect(socketMock.emit).toHaveBeenCalledWith(
          'move:play',
          expect.objectContaining({
            matchId: 'm1',
            move: { row: 1, col: 0 },
          }),
      );
    });

    it('playMove NO limpia un error terminal', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      await act(async () => {
        handlers.get('session:state')?.({
          matchId: 'm1',
          layout: 'B/..',
          turn: 1,
          version: 3,
          timerEndsAt: Date.now() + 5000,
        });
      });

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'SESSION_NOT_FOUND',
          message: 'Not found',
        });
      });

      expect(result.current.error?.code).toBe('SESSION_NOT_FOUND');

      await act(async () => {
        await result.current.playMove(1, 0);
      });

      expect(result.current.error?.code).toBe('SESSION_NOT_FOUND');
    });

    it('session:state posterior limpia cualquier error previo', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'VERSION_CONFLICT',
          message: 'Version mismatch',
        });
      });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');

      await act(async () => {
        handlers.get('session:state')?.({
          matchId: 'm1',
          layout: 'BR/..',
          turn: 0,
          version: 4,
          timerEndsAt: Date.now() + 5000,
        });
      });

      expect(result.current.error).toBeNull();
    });

    it('SESSION_NOT_FOUND marca isTerminalError y NO se auto-limpia', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      vi.useFakeTimers();

      await act(async () => {
        handlers.get('session:error')?.({
          code: 'SESSION_NOT_FOUND',
          message: 'Not found',
        });
      });

      expect(result.current.isTerminalError).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.error?.code).toBe('SESSION_NOT_FOUND');
    });
  });
});