import { describe, it, expect, beforeEach, vi } from 'vitest';
import { onlineSocketClient } from '../features/game/realtime/onlineSocketClient';

const mockSocket = {
  connected: true,
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

const { ioMock } = vi.hoisted(() => ({
  ioMock: vi.fn(() => mockSocket),
}));

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

describe('onlineSocketClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onlineSocketClient.resetForTests();
    mockSocket.connected = true;
  });

  it('connects passing auth token and socket path', () => {
    const socket = onlineSocketClient.connect('test-token');

    expect(ioMock).toHaveBeenCalledWith(window.location.origin, {
      path: '/api/game/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token: 'test-token' },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    expect(socket).toBe(mockSocket);
  });

  it('reuses existing connected socket', () => {
    const first = onlineSocketClient.connect('token-a');
    const second = onlineSocketClient.connect('token-b');

    expect(first).toBe(second);
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it('disconnects stale socket before reconnecting', () => {
    onlineSocketClient.connect('token-a');
    onlineSocketClient.disconnect();
    mockSocket.connected = false;

    const second = onlineSocketClient.connect('token-b');

    expect(second).toBe(mockSocket);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  it('emits events through socket', () => {
    onlineSocketClient.connect('test-token');
    onlineSocketClient.emit('move:play', { row: 1, col: 2 });

    expect(mockSocket.emit).toHaveBeenCalledWith('move:play', { row: 1, col: 2 });
  });

  it('returns noop unsubscribe when socket is absent', () => {
    const unsub = onlineSocketClient.on('queue:status', vi.fn());
    const unsubOnce = onlineSocketClient.once('queue:status', vi.fn());

    expect(typeof unsub).toBe('function');
    expect(typeof unsubOnce).toBe('function');
    unsub();
    unsubOnce();
  });

  it('registers and unregisters listeners', () => {
    onlineSocketClient.connect('test-token');
    const handler = vi.fn();
    const unsub = onlineSocketClient.on('session:state', handler);

    expect(mockSocket.on).toHaveBeenCalledWith('session:state', handler);

    unsub();
    expect(mockSocket.off).toHaveBeenCalledWith('session:state', handler);
  });

  it('disconnects only when last consumer releases socket', () => {
    onlineSocketClient.connect('test-token');
    onlineSocketClient.connect('other-token');

    onlineSocketClient.disconnect();
    expect(mockSocket.disconnect).not.toHaveBeenCalled();

    onlineSocketClient.disconnect();
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(onlineSocketClient.raw()).toBeNull();
    expect(onlineSocketClient.isConnected()).toBe(false);
  });
});