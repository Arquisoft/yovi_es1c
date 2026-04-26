import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessagesWithFriend, sendMessageToFriend } from '../features/friends/api/chatApi'
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

describe('chatApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads messages with pagination query params', async () => {
    const payload = {
      conversationId: 8,
      messages: [{ id: 1, conversationId: 8, senderUserId: 2, text: 'hola', createdAt: '2026-01-01T00:00:00.000Z' }],
    }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(getMessagesWithFriend(2, { limit: 20, beforeId: 50 })).resolves.toEqual(payload)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/users/chat/with/2/messages?limit=20&beforeId=50')
  })

  it('sends a message to a friend', async () => {
    const message = { id: 2, conversationId: 8, senderUserId: 1, text: 'vamos?', createdAt: '2026-01-01T00:01:00.000Z' }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse(message, { status: 201 }))

    await expect(sendMessageToFriend(2, 'vamos?')).resolves.toEqual(message)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/users/chat/with/2/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'vamos?' }),
    })
  })

  it('throws backend chat errors', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse({ message: 'No sois amigos' }, { status: 403 }))

    await expect(sendMessageToFriend(9, 'hola')).rejects.toThrow('No sois amigos')
  })
})
