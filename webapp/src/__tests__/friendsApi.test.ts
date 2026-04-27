import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptFriendRequest,
  deleteFriend,
  deleteFriendRequest,
  getFriendsOverview,
  sendFriendRequest,
} from '../features/friends/api/friendsApi'
import { fetchWithAuth } from '../shared/api/fetchWithAuth'

vi.mock('../shared/api/fetchWithAuth', () => ({
  fetchWithAuth: vi.fn(),
}))

const fetchWithAuthMock = vi.mocked(fetchWithAuth)

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('friendsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads friends and pending requests as one overview', async () => {
    const friends = [{ id: 2, username: 'bea', displayName: null, avatar: null, friendsSince: '2026-01-01T00:00:00.000Z' }]
    const requests = [{ id: 10, status: 'pending', direction: 'incoming', createdAt: '2026-01-02T00:00:00.000Z', user: { id: 3, username: 'cai', displayName: null, avatar: null } }]

    fetchWithAuthMock
      .mockResolvedValueOnce(jsonResponse(friends))
      .mockResolvedValueOnce(jsonResponse(requests))

    await expect(getFriendsOverview()).resolves.toEqual({ friends, requests })

    expect(fetchWithAuthMock).toHaveBeenNthCalledWith(1, '/api/users/friends')
    expect(fetchWithAuthMock).toHaveBeenNthCalledWith(2, '/api/users/friends/requests')
  })

  it('sends a friend request by username', async () => {
    const request = { id: 11, status: 'pending', direction: 'outgoing', createdAt: '2026-01-02T00:00:00.000Z', user: { id: 4, username: 'dani', displayName: null, avatar: null } }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse(request, { status: 201 }))

    await expect(sendFriendRequest('dani')).resolves.toEqual(request)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/users/friends/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dani' }),
    })
  })

  it('accepts, deletes requests and deletes friends through the expected endpoints', async () => {
    const accepted = { id: 12, status: 'accepted', direction: 'incoming', createdAt: '2026-01-02T00:00:00.000Z', user: { id: 5, username: 'eva', displayName: 'Eva', avatar: null } }
    fetchWithAuthMock
      .mockResolvedValueOnce(jsonResponse(accepted))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(acceptFriendRequest(12)).resolves.toEqual(accepted)
    await expect(deleteFriendRequest(12)).resolves.toBeUndefined()
    await expect(deleteFriend(5)).resolves.toBeUndefined()

    expect(fetchWithAuthMock).toHaveBeenNthCalledWith(1, '/api/users/friends/requests/12/accept', { method: 'POST' })
    expect(fetchWithAuthMock).toHaveBeenNthCalledWith(2, '/api/users/friends/requests/12', { method: 'DELETE' })
    expect(fetchWithAuthMock).toHaveBeenNthCalledWith(3, '/api/users/friends/5', { method: 'DELETE' })
  })

  it('uses backend error messages when an operation fails', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({ message: 'Ya existe una solicitud pendiente' }, { status: 409 }))

    await expect(sendFriendRequest('bea')).rejects.toThrow('Ya existe una solicitud pendiente')
  })
})
