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

describe('chatApi additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads messages without optional pagination query params', async () => {
    const payload = { conversationId: 9, messages: [] }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(getMessagesWithFriend(3)).resolves.toEqual(payload)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/users/chat/with/3/messages')
  })

  it('omits falsy pagination options from the query string', async () => {
    const payload = { conversationId: 9, messages: [] }
    fetchWithAuthMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(getMessagesWithFriend(3, { limit: 0, beforeId: 0 })).resolves.toEqual(payload)

    expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/users/chat/with/3/messages')
  })

  it('uses fallback messages when chat errors are not JSON', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))

    await expect(getMessagesWithFriend(3)).rejects.toThrow('No se pudo cargar el chat')
    await expect(sendMessageToFriend(3, 'hola')).rejects.toThrow('No se pudo enviar el mensaje')
  })
})
