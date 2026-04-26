import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MessagesPage from '../features/messages/ui/MessagesPage'
import { useAuth } from '../features/auth'
import { getFriendsOverview } from '../features/friends/api/friendsApi'
import { getMessagesWithFriend, sendMessageToFriend } from '../features/friends/api/chatApi'

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

const useAuthMock = vi.mocked(useAuth)
const getFriendsOverviewMock = vi.mocked(getFriendsOverview)
const getMessagesWithFriendMock = vi.mocked(getMessagesWithFriend)
const sendMessageToFriendMock = vi.mocked(sendMessageToFriend)

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
  })

  it('loads a chat from the route and sends a message', async () => {
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

    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje'), { target: { value: 'vamos?' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))

    await waitFor(() => expect(sendMessageToFriendMock).toHaveBeenCalledWith(2, 'vamos?'))
    expect(await screen.findByText('vamos?')).toBeInTheDocument()
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
  it('refreshes the active chat periodically so incoming messages appear', async () => {
    let intervalCallback: (() => void) | null = null

    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        intervalCallback = callback as () => void
      }

      return 123
    }) as typeof window.setInterval)

    const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined)

    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })

    getMessagesWithFriendMock
        .mockResolvedValueOnce({
          conversationId: 99,
          messages: [{ id: 1, conversationId: 99, senderUserId: 2, text: 'hola', createdAt: '2026-01-01T00:00:00.000Z' }],
        })
        .mockResolvedValueOnce({
          conversationId: 99,
          messages: [
            { id: 2, conversationId: 99, senderUserId: 2, text: 'nuevo mensaje', createdAt: '2026-01-01T00:01:00.000Z' },
            { id: 1, conversationId: 99, senderUserId: 2, text: 'hola', createdAt: '2026-01-01T00:00:00.000Z' },
          ],
        })

    renderPage('/messages/2')

    expect(await screen.findByText('hola')).toBeInTheDocument()
    expect(setIntervalSpy).toHaveBeenCalled()

    await act(async () => {
      intervalCallback?.()
    })

    expect(await screen.findByText('nuevo mensaje')).toBeInTheDocument()
    expect(getMessagesWithFriendMock).toHaveBeenCalledTimes(2)

    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })
})
