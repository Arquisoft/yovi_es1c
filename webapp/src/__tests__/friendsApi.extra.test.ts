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

describe('friendsApi additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws the friends fallback message when loading friends fails with invalid JSON', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([]))

    await expect(getFriendsOverview()).rejects.toThrow('No se pudo cargar la lista de amigos')
  })

  it('throws the requests fallback message when loading requests fails with invalid JSON', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))

    await expect(getFriendsOverview()).rejects.toThrow('No se pudieron cargar las invitaciones')
  })

  it('uses fallback messages for failing friend operations when backend does not return JSON', async () => {
    fetchWithAuthMock
      .mockResolvedValueOnce(new Response('not json', { status: 409 }))
      .mockResolvedValueOnce(new Response('not json', { status: 403 }))
      .mockResolvedValueOnce(new Response('not json', { status: 404 }))
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))

    await expect(sendFriendRequest('bea')).rejects.toThrow('No se pudo enviar la invitacion')
    await expect(acceptFriendRequest(1)).rejects.toThrow('No se pudo aceptar la invitacion')
    await expect(deleteFriendRequest(1)).rejects.toThrow('No se pudo cancelar la invitacion')
    await expect(deleteFriend(2)).rejects.toThrow('No se pudo eliminar el amigo')
  })
})
