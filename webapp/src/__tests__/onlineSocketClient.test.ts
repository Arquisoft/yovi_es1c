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
    onlineSocketClient.disconnect();
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

  it('emits events through socket', () => {
    onlineSocketClient.connect('test-token');
    onlineSocketClient.emit('move:play', { row: 1, col: 2 });

    expect(mockSocket.emit).toHaveBeenCalledWith('move:play', { row: 1, col: 2 });
  });

  it('disconnects active socket', () => {
    onlineSocketClient.connect('test-token');
    onlineSocketClient.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('reports connected state', () => {
    onlineSocketClient.connect('test-token');
    expect(onlineSocketClient.isConnected()).toBe(true);
  });
});
