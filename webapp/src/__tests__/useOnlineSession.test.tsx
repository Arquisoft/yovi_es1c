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

  it('sets error on session:error socket event', async () => {
    const { result } = renderHook(() => useOnlineSession('m1'));
    await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

    act(() => {
      handlers.get('session:error')?.({ code: 'NOT_YOUR_TURN', message: 'Wait your turn' });
    });

    expect(result.current.error?.message).toBe('Wait your turn');
  });

  it('playMove does nothing when there is a winner', async () => {
    const { result } = renderHook(() => useOnlineSession('m1'));
    await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

    act(() => {
      handlers.get('session:state')?.({
        matchId: 'm1',
        layout: 'B/..',
        turn: 0,
        version: 3,
        timerEndsAt: Date.now() + 1000,
        winner: 'B',
      });
    });

    act(() => { result.current.playMove(1, 2); });

    expect(socketMock.emit).not.toHaveBeenCalledWith('move:play', expect.anything());
  });

  // ─── Bug 2: VERSION_CONFLICT y errores recuperables ───────────────────────

  describe('errores recuperables (VERSION_CONFLICT, NOT_YOUR_TURN, DUPLICATE_EVENT)', () => {
    it('VERSION_CONFLICT: establece el error pero NO marca isTerminalError', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      act(() => {
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
      // ✅ waitFor ANTES de activar fake timers, para que el setup del hook no se cuelgue
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());
      vi.useFakeTimers();

      act(() => {
        handlers.get('session:error')?.({
          code: 'VERSION_CONFLICT',
          message: 'Version mismatch',
        });
      });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');

      await act(async () => { vi.advanceTimersByTime(3000); });

      expect(result.current.error).toBeNull();
      vi.useRealTimers();
    });

    it('NOT_YOUR_TURN: se auto-limpia pasados 3 segundos', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());
      vi.useFakeTimers();

      act(() => {
        handlers.get('session:error')?.({ code: 'NOT_YOUR_TURN', message: 'Wait your turn' });
      });

      expect(result.current.error?.code).toBe('NOT_YOUR_TURN');

      await act(async () => { vi.advanceTimersByTime(3000); });

      expect(result.current.error).toBeNull();
      vi.useRealTimers();
    });

    it('DUPLICATE_EVENT: se auto-limpia pasados 3 segundos', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());
      vi.useFakeTimers();

      act(() => {
        handlers.get('session:error')?.({ code: 'DUPLICATE_EVENT', message: 'Already processed' });
      });

      expect(result.current.error?.code).toBe('DUPLICATE_EVENT');

      await act(async () => { vi.advanceTimersByTime(3000); });

      expect(result.current.error).toBeNull();
      vi.useRealTimers();
    });

    it('error recuperable NO se limpia antes de los 3 segundos', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());
      vi.useFakeTimers();

      act(() => {
        handlers.get('session:error')?.({ code: 'VERSION_CONFLICT', message: 'Version mismatch' });
      });

      await act(async () => { vi.advanceTimersByTime(1500); });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');
      vi.useRealTimers();
    });

    it('playMove limpia un error recuperable previo antes de emitir', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      // Primero recibimos estado para tener sessionState
      act(() => {
        handlers.get('session:state')?.({
          matchId: 'm1',
          layout: 'B/..',
          turn: 1,
          version: 3,
          timerEndsAt: Date.now() + 5000,
        });
      });

      // Luego llega un error recuperable
      act(() => {
        handlers.get('session:error')?.({ code: 'VERSION_CONFLICT', message: 'Version mismatch' });
      });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');

      // Al intentar un nuevo movimiento, el error debe limpiarse
      act(() => { result.current.playMove(1, 0); });

      expect(result.current.error).toBeNull();
      expect(socketMock.emit).toHaveBeenCalledWith('move:play', expect.objectContaining({
        matchId: 'm1',
        move: { row: 1, col: 0 },
      }));
    });

    it('playMove NO limpia un error terminal', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      act(() => {
        handlers.get('session:state')?.({
          matchId: 'm1',
          layout: 'B/..',
          turn: 1,
          version: 3,
          timerEndsAt: Date.now() + 5000,
        });
      });

      act(() => {
        handlers.get('session:error')?.({ code: 'SESSION_NOT_FOUND', message: 'Not found' });
      });

      expect(result.current.error?.code).toBe('SESSION_NOT_FOUND');

      act(() => { result.current.playMove(1, 0); });

      // El error terminal NO se limpia
      expect(result.current.error?.code).toBe('SESSION_NOT_FOUND');
    });

    it('session:state posterior limpia cualquier error previo', async () => {
      const { result } = renderHook(() => useOnlineSession('m1'));
      await waitFor(() => expect(socketMock.on).toHaveBeenCalled());

      act(() => {
        handlers.get('session:error')?.({ code: 'VERSION_CONFLICT', message: 'Version mismatch' });
      });

      expect(result.current.error?.code).toBe('VERSION_CONFLICT');

      act(() => {
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

      act(() => {
        handlers.get('session:error')?.({ code: 'SESSION_NOT_FOUND', message: 'Not found' });
      });

      expect(result.current.isTerminalError).toBe(true);

      await act(async () => { vi.advanceTimersByTime(5000); });

      expect(result.current.error?.code).toBe('SESSION_NOT_FOUND');
      vi.useRealTimers();
    });
  });
});