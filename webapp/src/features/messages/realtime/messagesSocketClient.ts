import { io, type Socket } from 'socket.io-client'
import { API_CONFIG } from '../../../config/api.config'
import type { ChatMessage } from '../../friends/api/chatApi'

type Handler<T> = (payload: T) => void

export type ChatJoinedPayload = {
  conversationId: number
  friendUserId: number
}

export type ChatErrorPayload = {
  code: string
  message: string
}

function resolveSocketTarget() {
  const usersApiUrl = new URL(API_CONFIG.USERS_API, globalThis.location.origin)
  const apiPath = usersApiUrl.pathname.replace(/\/$/, '')

  return {
    origin: usersApiUrl.origin,
    path: `${apiPath}/chat/socket.io`,
  }
}

class MessagesSocketClient {
  private socket: Socket | null = null
  private connectionUsers = 0

  connect(token: string): Socket {
    this.connectionUsers += 1

    if (this.socket?.connected) {
      return this.socket
    }

    if (this.socket) {
      this.socket.disconnect()
    }

    const target = resolveSocketTarget()
    this.socket = io(target.origin, {
      path: target.path,
      transports: ['websocket'],
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })

    return this.socket
  }

  disconnect(): void {
    if (this.connectionUsers > 0) {
      this.connectionUsers -= 1
    }

    if (this.connectionUsers > 0) {
      return
    }

    this.socket?.disconnect()
    this.socket = null
  }

  joinConversation(friendUserId: number): void {
    this.socket?.emit('chat:join', { friendUserId })
  }

  leaveConversation(conversationId?: number): void {
    this.socket?.emit('chat:leave', { conversationId })
  }

  onMessage(handler: Handler<ChatMessage>): () => void {
    return this.on('chat:message', handler)
  }

  onJoined(handler: Handler<ChatJoinedPayload>): () => void {
    return this.on('chat:joined', handler)
  }

  onChatError(handler: Handler<ChatErrorPayload>): () => void {
    return this.on('chat:error', handler)
  }

  onConnectionError(handler: Handler<Error>): () => void {
    return this.on('connect_error', handler)
  }

  private on<T>(event: string, handler: Handler<T>): () => void {
    if (!this.socket) {
      return () => {}
    }

    this.socket.on(event, handler as never)

    return () => {
      this.socket?.off(event, handler as never)
    }
  }

  raw(): Socket | null {
    return this.socket
  }

  resetForTests(): void {
    this.connectionUsers = 0
    this.socket = null
  }
}

export const messagesSocketClient = new MessagesSocketClient()
