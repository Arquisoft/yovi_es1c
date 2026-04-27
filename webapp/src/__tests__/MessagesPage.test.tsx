import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MessagesPage from '../features/messages/ui/MessagesPage'
import { useAuth } from '../features/auth'
import { getFriendsOverview } from '../features/friends/api/friendsApi'
import { getMessagesWithFriend, sendMessageToFriend, type ChatMessage } from '../features/friends/api/chatApi'

const socketMocks = vi.hoisted(() => {
  let messageHandler: ((message: ChatMessage) => void) | null = null
  let connectionErrorHandler: (() => void) | null = null
  let chatErrorHandler: (() => void) | null = null

  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    joinConversation: vi.fn(),
    leaveConversation: vi.fn(),
    offMessage: vi.fn(),
    offConnectionError: vi.fn(),
    offChatError: vi.fn(),
    emitMessage(message: ChatMessage) {
      messageHandler?.(message)
    },
    emitConnectionError() {
      connectionErrorHandler?.()
    },
    emitChatError() {
      chatErrorHandler?.()
    },
    resetHandlers() {
      messageHandler = null
      connectionErrorHandler = null
      chatErrorHandler = null
    },
    client: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      joinConversation: vi.fn(),
      leaveConversation: vi.fn(),
      onMessage: vi.fn((handler: (message: ChatMessage) => void) => {
        messageHandler = handler
        return socketMocks.offMessage
      }),
      onConnectionError: vi.fn((handler: () => void) => {
        connectionErrorHandler = handler
        return socketMocks.offConnectionError
      }),
      onChatError: vi.fn((handler: () => void) => {
        chatErrorHandler = handler
        return socketMocks.offChatError
      }),
    },
  }
})

vi.mock('../features/auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../features/friends/api/friendsApi', () => ({
  getFriendsOverview: vi.fn(),
}))

vi.mock('../features/friends/api/chatApi', () => ({
  getMessagesWithFriend: vi.fn(),
  sendMessageToFriend: vi.fn(),
}))

vi.mock('../features/messages/realtime/messagesSocketClient', () => ({
  messagesSocketClient: socketMocks.client,
}))

const useAuthMock = vi.mocked(useAuth)
const getFriendsOverviewMock = vi.mocked(getFriendsOverview)
const getMessagesWithFriendMock = vi.mocked(getMessagesWithFriend)
const sendMessageToFriendMock = vi.mocked(sendMessageToFriend)
const messagesSocketClientMock = socketMocks.client

function renderPage(initialEntry = '/messages') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:friendId" element={<MessagesPage />} />
        <Route path="/friends" element={<div>Friends route</div>} />
        <Route path="/login" element={<div>Login route</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    socketMocks.resetHandlers()
    useAuthMock.mockReturnValue({
      token: 'token',
      refreshToken: 'refresh',
      user: { id: 1, username: 'alice' },
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })
  })

  it('lists friends and asks the user to select a conversation', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [
        { id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' },
        { id: 3, username: 'cai', displayName: null, avatar: null, friendsSince: '2026-01-02T00:00:00.000Z' },
      ],
      requests: [],
    })

    renderPage()

    expect(await screen.findByText('Bea')).toBeInTheDocument()
    expect(screen.getByText('@cai')).toBeInTheDocument()
    expect(screen.getByText('Selecciona una conversación')).toBeInTheDocument()
    expect(getMessagesWithFriendMock).not.toHaveBeenCalled()
    expect(messagesSocketClientMock.connect).not.toHaveBeenCalled()
  })

  it('loads a chat from the route and sends a message through the existing REST endpoint', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })
    getMessagesWithFriendMock.mockResolvedValueOnce({
      conversationId: 99,
      messages: [{ id: 1, conversationId: 99, senderUserId: 2, text: 'hola', createdAt: '2026-01-01T00:00:00.000Z' }],
    })
    sendMessageToFriendMock.mockResolvedValueOnce({
      id: 2,
      conversationId: 99,
      senderUserId: 1,
      text: 'vamos?',
      createdAt: '2026-01-01T00:01:00.000Z',
    })

    renderPage('/messages/2')

    expect(await screen.findByText('Chat con Bea')).toBeInTheDocument()
    expect(await screen.findByText('hola')).toBeInTheDocument()
    expect(messagesSocketClientMock.connect).toHaveBeenCalledWith('token')
    expect(messagesSocketClientMock.joinConversation).toHaveBeenCalledWith(2)

    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje'), { target: { value: 'vamos?' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))

    await waitFor(() => expect(sendMessageToFriendMock).toHaveBeenCalledWith(2, 'vamos?'))
    expect(await screen.findByText('vamos?')).toBeInTheDocument()
    expect(getMessagesWithFriendMock).toHaveBeenCalledTimes(1)
  })

  it('receives new messages over WebSocket without polling', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })
    getMessagesWithFriendMock.mockResolvedValueOnce({
      conversationId: 99,
      messages: [{ id: 1, conversationId: 99, senderUserId: 2, text: 'hola', createdAt: '2026-01-01T00:00:00.000Z' }],
    })

    renderPage('/messages/2')

    expect(await screen.findByText('hola')).toBeInTheDocument()

    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    await act(async () => {
      socketMocks.emitMessage({
        id: 2,
        conversationId: 99,
        senderUserId: 2,
        text: 'nuevo mensaje',
        createdAt: '2026-01-01T00:01:00.000Z',
      })
    })

    expect(screen.getByText('nuevo mensaje')).toBeInTheDocument()
    expect(getMessagesWithFriendMock).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy.mock.calls.some(([, delay]) => delay === 3000)).toBe(false)

    setIntervalSpy.mockRestore()
  })

  it('keeps the chat scroll inside the messages container when receiving WebSocket messages', async () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    const scrollIntoViewMock = vi.fn()

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 480,
    })

    try {
      getFriendsOverviewMock.mockResolvedValueOnce({
        friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
        requests: [],
      })
      getMessagesWithFriendMock.mockResolvedValueOnce({
        conversationId: 99,
        messages: [{ id: 1, conversationId: 99, senderUserId: 2, text: 'hola', createdAt: '2026-01-01T00:00:00.000Z' }],
      })

      renderPage('/messages/2')

      expect(await screen.findByText('hola')).toBeInTheDocument()
      const messagesContainer = screen.getByTestId('messages-scroll-container')

      await act(async () => {
        socketMocks.emitMessage({
          id: 2,
          conversationId: 99,
          senderUserId: 2,
          text: 'mensaje con scroll estable',
          createdAt: '2026-01-01T00:01:00.000Z',
        })
      })

      expect(screen.getByText('mensaje con scroll estable')).toBeInTheDocument()
      expect(messagesContainer.scrollTop).toBe(480)
      expect(scrollIntoViewMock).not.toHaveBeenCalled()
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView)
      } else {
        delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView
      }

      if (originalScrollHeight) {
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
      } else {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
      }
    }
  })

  it('does not duplicate messages received both from send response and WebSocket echo', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })
    getMessagesWithFriendMock.mockResolvedValueOnce({ conversationId: 99, messages: [] })
    sendMessageToFriendMock.mockResolvedValueOnce({
      id: 7,
      conversationId: 99,
      senderUserId: 1,
      text: 'sin duplicar',
      createdAt: '2026-01-01T00:01:00.000Z',
    })

    renderPage('/messages/2')

    expect(await screen.findByText('Chat con Bea')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje'), { target: { value: 'sin duplicar' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))

    expect(await screen.findByText('sin duplicar')).toBeInTheDocument()

    await act(async () => {
      socketMocks.emitMessage({
        id: 7,
        conversationId: 99,
        senderUserId: 1,
        text: 'sin duplicar',
        createdAt: '2026-01-01T00:01:00.000Z',
      })
    })

    expect(screen.getAllByText('sin duplicar')).toHaveLength(1)
  })

  it('cleans WebSocket listeners and leaves the active room on unmount', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })
    getMessagesWithFriendMock.mockResolvedValueOnce({ conversationId: 99, messages: [] })

    const { unmount } = renderPage('/messages/2')

    expect(await screen.findByText('Chat con Bea')).toBeInTheDocument()

    unmount()

    expect(socketMocks.offMessage).toHaveBeenCalled()
    expect(socketMocks.offConnectionError).toHaveBeenCalled()
    expect(socketMocks.offChatError).toHaveBeenCalled()
    expect(messagesSocketClientMock.leaveConversation).toHaveBeenCalledWith(99)
    expect(messagesSocketClientMock.disconnect).toHaveBeenCalled()
  })

  it('shows i18n realtime connection errors', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })
    getMessagesWithFriendMock.mockResolvedValueOnce({ conversationId: 99, messages: [] })

    renderPage('/messages/2')

    expect(await screen.findByText('Chat con Bea')).toBeInTheDocument()

    await act(async () => {
      socketMocks.emitConnectionError()
    })

    expect(screen.getByText('No se pudo conectar al chat en tiempo real. Recarga la página para reintentar.')).toBeInTheDocument()
  })

  it('opens a chat when selecting a friend from the list', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })
    getMessagesWithFriendMock.mockResolvedValueOnce({
      conversationId: 99,
      messages: [],
    })

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Bea/i }))

    expect(await screen.findByText('Chat con Bea')).toBeInTheDocument()
    await waitFor(() => expect(getMessagesWithFriendMock).toHaveBeenCalledWith(2, { limit: 50 }))
  })

  it('shows a safe state when the selected friend does not exist', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })

    renderPage('/messages/42')

    expect(await screen.findByText('No encontramos ese amigo')).toBeInTheDocument()
    expect(getMessagesWithFriendMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Volver a amigos/i }))
    expect(await screen.findByText('Friends route')).toBeInTheDocument()
  })

  it('redirects unauthenticated users to login', async () => {
    useAuthMock.mockReturnValueOnce({
      token: null,
      refreshToken: null,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      updateTokens: vi.fn(),
    })
    getFriendsOverviewMock.mockResolvedValueOnce({ friends: [], requests: [] })

    renderPage()

    expect(await screen.findByText('Login route')).toBeInTheDocument()
  })
})
