import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import FriendsPage from '../features/friends/ui/FriendsPage'
import { useAuth } from '../features/auth'
import {
  acceptFriendRequest,
  deleteFriend,
  deleteFriendRequest,
  getFriendsOverview,
  sendFriendRequest,
} from '../features/friends/api/friendsApi'
import { getMessagesWithFriend, sendMessageToFriend } from '../features/friends/api/chatApi'

vi.mock('../features/auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../features/friends/api/friendsApi', () => ({
  acceptFriendRequest: vi.fn(),
  deleteFriend: vi.fn(),
  deleteFriendRequest: vi.fn(),
  getFriendsOverview: vi.fn(),
  sendFriendRequest: vi.fn(),
}))

vi.mock('../features/friends/api/chatApi', () => ({
  getMessagesWithFriend: vi.fn(),
  sendMessageToFriend: vi.fn(),
}))

const useAuthMock = vi.mocked(useAuth)
const getFriendsOverviewMock = vi.mocked(getFriendsOverview)
const sendFriendRequestMock = vi.mocked(sendFriendRequest)
const acceptFriendRequestMock = vi.mocked(acceptFriendRequest)
const deleteFriendRequestMock = vi.mocked(deleteFriendRequest)
const deleteFriendMock = vi.mocked(deleteFriend)
const getMessagesWithFriendMock = vi.mocked(getMessagesWithFriend)
const sendMessageToFriendMock = vi.mocked(sendMessageToFriend)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/friends']}>
      <FriendsPage />
    </MemoryRouter>,
  )
}

describe('FriendsPage', () => {
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('loads friends and pending requests', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [
        { id: 10, status: 'pending', direction: 'incoming', createdAt: '2026-01-02T00:00:00.000Z', user: { id: 3, username: 'cai', displayName: 'Cai', avatar: null } },
        { id: 11, status: 'pending', direction: 'outgoing', createdAt: '2026-01-03T00:00:00.000Z', user: { id: 4, username: 'dani', displayName: null, avatar: null } },
      ],
    })

    renderPage()

    expect(await screen.findByText('Bea')).toBeInTheDocument()
    expect(screen.getByText('Cai')).toBeInTheDocument()
    expect(screen.getByText('@dani')).toBeInTheDocument()
  })

  it('sends a friend request and adds it to outgoing requests', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({ friends: [], requests: [] })
    sendFriendRequestMock.mockResolvedValueOnce({
      id: 12,
      status: 'pending',
      direction: 'outgoing',
      createdAt: '2026-01-04T00:00:00.000Z',
      user: { id: 5, username: 'eva', displayName: null, avatar: null },
    })

    renderPage()

    await screen.findByText('Todavia no tienes amigos agregados.')
    fireEvent.change(screen.getByLabelText(/Nombre de usuario/i), { target: { value: 'eva' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar invitacion/i }))

    await waitFor(() => expect(sendFriendRequestMock).toHaveBeenCalledWith('eva'))
    expect(await screen.findByText('Invitacion enviada a eva')).toBeInTheDocument()
    expect(screen.getByText('@eva')).toBeInTheDocument()
  })

  it('accepts and rejects friend requests', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [],
      requests: [
        { id: 20, status: 'pending', direction: 'incoming', createdAt: '2026-01-02T00:00:00.000Z', user: { id: 6, username: 'fede', displayName: 'Fede', avatar: null } },
        { id: 21, status: 'pending', direction: 'outgoing', createdAt: '2026-01-03T00:00:00.000Z', user: { id: 7, username: 'gala', displayName: null, avatar: null } },
      ],
    })
    acceptFriendRequestMock.mockResolvedValueOnce({
      id: 20,
      status: 'accepted',
      direction: 'incoming',
      createdAt: '2026-01-02T00:00:00.000Z',
      user: { id: 6, username: 'fede', displayName: 'Fede', avatar: null },
    })
    deleteFriendRequestMock.mockResolvedValueOnce()

    renderPage()

    await screen.findByText('Fede')
    fireEvent.click(screen.getByRole('button', { name: /Aceptar/i }))

    await waitFor(() => expect(acceptFriendRequestMock).toHaveBeenCalledWith(20))
    expect(await screen.findByText('Ahora eres amigo de fede')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }))
    await waitFor(() => expect(deleteFriendRequestMock).toHaveBeenCalledWith(21))
  })

  it('opens chat and sends a message to a friend', async () => {
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

    renderPage()

    await screen.findByText('Bea')
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))

    expect(await screen.findByText('Chat con Bea')).toBeInTheDocument()
    expect(screen.getByText('hola')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje'), { target: { value: 'vamos?' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/i }))

    await waitFor(() => expect(sendMessageToFriendMock).toHaveBeenCalledWith(2, 'vamos?'))
    expect(await screen.findByText('vamos?')).toBeInTheDocument()
  })

  it('removes a friend when the user confirms', async () => {
    getFriendsOverviewMock.mockResolvedValueOnce({
      friends: [{ id: 2, username: 'bea', displayName: 'Bea', avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }],
      requests: [],
    })
    deleteFriendMock.mockResolvedValueOnce()

    renderPage()

    await screen.findByText('Bea')
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }))

    await waitFor(() => expect(deleteFriendMock).toHaveBeenCalledWith(2))
    expect(await screen.findByText('Bea eliminado de tus amigos')).toBeInTheDocument()
  })
})
