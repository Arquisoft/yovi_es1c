import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptFriendMatchInvite,
  createFriendMatchInvite,
  declineFriendMatchInvite,
  getPendingFriendMatchInvite,
  getOutgoingFriendMatchInvite,
} from '../features/friends/api/friendMatchApi'
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

const rules = {
  pieRule: { enabled: true },
  honey: { enabled: false, blockedCells: [] },
}

describe('friendMatchApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a friend match invite with rules and board size', async () => {
    const invite = {
      inviteId: 'friend-1',
      requesterId: 1,
      requesterName: 'ana',
      recipientId: 2,
      recipientName: 'bea',
      boardSize: 8,
      rules,
      ranked: false,
      source: 'friend',
      status: 'pending',
      createdAt: 1,
      expiresAt: 2,
    }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse(invite, { status: 201 }))

    await expect(createFriendMatchInvite(2, 8, rules)).resolves.toEqual(invite)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/game/online/friend-invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendUserId: 2, boardSize: 8, rules }),
    })
  })

  it('returns null when there is no pending friend match invite', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(getPendingFriendMatchInvite()).resolves.toBeNull()
  })

  it('loads the outgoing friend match invite', async () => {
    const invite = {
      inviteId: 'friend-1',
      requesterId: 1,
      requesterName: 'ana',
      recipientId: 2,
      recipientName: 'bea',
      boardSize: 8,
      rules,
      ranked: false,
      source: 'friend',
      status: 'pending',
      createdAt: 1,
      expiresAt: 2,
    }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse(invite))

    await expect(getOutgoingFriendMatchInvite()).resolves.toEqual(invite)
    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/game/online/friend-invites/outgoing', { method: 'GET' })
  })

  it('accepts and declines friend match invites through the expected endpoints', async () => {
    const ready = {
      matchId: 'friend-match-1',
      boardSize: 8,
      size: 8,
      rules,
      ranked: false,
      source: 'friend',
      players: [
        { userId: 1, username: 'ana', symbol: 'B' },
        { userId: 2, username: 'bea', symbol: 'R' },
      ],
    }
    fetchWithAuthMock
      .mockResolvedValueOnce(jsonResponse(ready, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(acceptFriendMatchInvite('friend-1')).resolves.toEqual(ready)
    await expect(declineFriendMatchInvite('friend-1')).resolves.toBeUndefined()

    expect(fetchWithAuthMock).toHaveBeenNthCalledWith(1, '/api/game/online/friend-invites/friend-1/accept', { method: 'POST' })
    expect(fetchWithAuthMock).toHaveBeenNthCalledWith(2, '/api/game/online/friend-invites/friend-1/decline', { method: 'POST' })
  })

  it('maps backend error codes to i18n keys', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({ code: 'FRIENDSHIP_REQUIRED' }, { status: 403 }))

    await expect(createFriendMatchInvite(2, 8, rules)).rejects.toThrow('friendMatchError.FRIENDSHIP_REQUIRED')
  })
})
