import { io, type Socket } from 'socket.io-client';

type Handler<T> = (payload: T) => void;

class OnlineSocketClient {
  private socket: Socket | null = null;

  connect(token: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(globalThis.location.origin, {
      path: '/api/game/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    return this.socket;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  emit<T>(event: string, payload?: T): void {
    this.socket?.emit(event, payload);
  }

  on<T>(event: string, handler: Handler<T>): () => void {
    if (!this.socket) {
      return () => {};
    }

    this.socket.on(event, handler as never);

    return () => {
      this.socket?.off(event, handler as never);
    };
  }

  once<T>(event: string, handler: Handler<T>): () => void {
    if (!this.socket) {
      return () => {};
    }

    this.socket.once(event, handler as never);

    return () => {
      this.socket?.off(event, handler as never);
    };
  }

  raw(): Socket | null {
    return this.socket;
  }
}

export const onlineSocketClient = new OnlineSocketClient();