import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatSession } from '../features/game/hooks/useChatSession';

const { listeners, emit } = vi.hoisted(() => ({
  listeners: new Map<string, (payload: unknown) => void>(),
  emit: vi.fn(),
}));

vi.mock('../features/game/realtime/onlineSocketClient', () => ({
  onlineSocketClient: {
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      listeners.set(event, handler);
      return () => listeners.delete(event);
    }),
    emit,
  },
}));

describe('useChatSession', () => {
  beforeEach(() => {
    listeners.clear();
    emit.mockReset();
  });

  it('accumulates messages from chat:message', () => {
    const { result } = renderHook(() => useChatSession('m1'));

    act(() => {
      listeners.get('chat:message')?.({
        matchId: 'm1',
        userId: 2,
        username: 'rival',
        text: 'hola',
        timestamp: 100,
      });
    });

    expect(result.current.messages).toEqual([
      { userId: 2, username: 'rival', text: 'hola', timestamp: 100 },
    ]);
  });

  it('loads initial history from session:state', () => {
    const { result } = renderHook(() => useChatSession('m1'));

    act(() => {
      listeners.get('session:state')?.({
        matchId: 'm1',
        messages: [
          { userId: 1, username: 'a', text: 'historial', timestamp: 10 },
          { userId: 2, username: 'b', text: 'msg', timestamp: 20 },
        ],
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].text).toBe('historial');
  });

  it('does not duplicate when message arrives via history and chat event', () => {
    const { result } = renderHook(() => useChatSession('m1'));
    const message = { userId: 2, username: 'b', text: 'dup', timestamp: 20 };

    act(() => {
      listeners.get('chat:message')?.({ matchId: 'm1', ...message });
      listeners.get('session:state')?.({ matchId: 'm1', messages: [message] });
    });

    expect(result.current.messages).toEqual([message]);
  });

  it('sendMessage emits chat:message', () => {
    const { result } = renderHook(() => useChatSession('m1'));

    act(() => {
      result.current.sendMessage('texto');
    });

    expect(emit).toHaveBeenCalledWith('chat:message', { matchId: 'm1', text: 'texto' });
  });
});
