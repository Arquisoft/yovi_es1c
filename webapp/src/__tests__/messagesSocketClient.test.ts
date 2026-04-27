import { describe, it, expect, beforeEach, vi } from 'vitest'
import { messagesSocketClient } from '../features/messages/realtime/messagesSocketClient'

const mockSocket = {
  connected: true,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
}

const { ioMock } = vi.hoisted(() => ({
  ioMock: vi.fn(() => mockSocket),
}))

vi.mock('socket.io-client', () => ({
  io: ioMock,
}))

describe('messagesSocketClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    messagesSocketClient.resetForTests()
    mockSocket.connected = true
  })

  it('connects to the users chat WebSocket path without long-polling transport', () => {
    const socket = messagesSocketClient.connect('test-token')

    expect(ioMock).toHaveBeenCalledWith(window.location.origin, {
      path: '/api/users/chat/socket.io',
      transports: ['websocket'],
      auth: { token: 'test-token' },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    })
    expect(socket).toBe(mockSocket)
  })

  it('emits join and leave events for the selected conversation', () => {
    messagesSocketClient.connect('test-token')

    messagesSocketClient.joinConversation(2)
    messagesSocketClient.leaveConversation(99)

    expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { friendUserId: 2 })
    expect(mockSocket.emit).toHaveBeenCalledWith('chat:leave', { conversationId: 99 })
  })

  it('registers and unregisters message listeners', () => {
    messagesSocketClient.connect('test-token')
    const handler = vi.fn()

    const unsubscribe = messagesSocketClient.onMessage(handler)

    expect(mockSocket.on).toHaveBeenCalledWith('chat:message', handler)

    unsubscribe()
    expect(mockSocket.off).toHaveBeenCalledWith('chat:message', handler)
  })

  it('disconnects only when the last consumer releases the socket', () => {
    messagesSocketClient.connect('test-token')
    messagesSocketClient.connect('test-token')

    messagesSocketClient.disconnect()
    expect(mockSocket.disconnect).not.toHaveBeenCalled()

    messagesSocketClient.disconnect()
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1)
    expect(messagesSocketClient.raw()).toBeNull()
  })
})
