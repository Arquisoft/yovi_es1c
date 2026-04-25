import { API_CONFIG } from '../../../config/api.config'
import { fetchWithAuth } from '../../../shared/api/fetchWithAuth'

export type Friend = {
  id: number
  username: string
  displayName: string | null
  avatar: string | null
  friendsSince: string
}

export type FriendRequest = {
  id: number
  status: 'pending' | 'accepted'
  createdAt: string
  direction: 'incoming' | 'outgoing'
  user: {
    id: number
    username: string
    displayName: string | null
    avatar: string | null
  }
}

type FriendsOverview = {
  friends: Friend[]
  requests: FriendRequest[]
}

async function parseError(response: Response, fallbackMessage: string): Promise<Error> {
  try {
    const data = await response.json()
    return new Error(data.message ?? fallbackMessage)
  } catch {
    return new Error(fallbackMessage)
  }
}

export async function getFriendsOverview(): Promise<FriendsOverview> {
  const [friendsResponse, requestsResponse] = await Promise.all([
    fetchWithAuth(`${API_CONFIG.USERS_API}/friends`),
    fetchWithAuth(`${API_CONFIG.USERS_API}/friends/requests`),
  ])

  if (!friendsResponse.ok) {
    throw await parseError(friendsResponse, 'No se pudo cargar la lista de amigos')
  }

  if (!requestsResponse.ok) {
    throw await parseError(requestsResponse, 'No se pudieron cargar las invitaciones')
  }

  const friends = await friendsResponse.json() as Friend[]
  const requests = await requestsResponse.json() as FriendRequest[]

  return { friends, requests }
}

export async function sendFriendRequest(username: string): Promise<FriendRequest> {
  const response = await fetchWithAuth(`${API_CONFIG.USERS_API}/friends/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  })

  if (!response.ok) {
    throw await parseError(response, 'No se pudo enviar la invitacion')
  }

  return await response.json() as FriendRequest
}

export async function acceptFriendRequest(requestId: number): Promise<FriendRequest> {
  const response = await fetchWithAuth(`${API_CONFIG.USERS_API}/friends/requests/${requestId}/accept`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw await parseError(response, 'No se pudo aceptar la invitacion')
  }

  return await response.json() as FriendRequest
}

export async function deleteFriendRequest(requestId: number): Promise<void> {
  const response = await fetchWithAuth(`${API_CONFIG.USERS_API}/friends/requests/${requestId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw await parseError(response, 'No se pudo cancelar la invitacion')
  }
}
