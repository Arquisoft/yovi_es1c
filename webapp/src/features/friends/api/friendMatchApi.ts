import { API_CONFIG } from '../../../config/api.config'
import { fetchWithAuth } from '../../../shared/api/fetchWithAuth'
import type { MatchRulesDto } from '../../../shared/contracts'

export type FriendMatchInvite = {
  inviteId: string
  requesterId: number
  requesterName: string
  recipientId: number
  recipientName: string
  boardSize: number
  rules: MatchRulesDto
  ranked: false
  source: 'friend'
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'
  createdAt: number
  expiresAt: number
}

export type FriendMatchReady = {
  matchId: string
  boardSize: number
  size: number
  rules: MatchRulesDto
  ranked: false
  source: 'friend'
  players: Array<{ userId: number; username: string; symbol: 'B' | 'R' }>
}

async function parseFriendMatchError(response: Response, fallbackKey: string): Promise<Error> {
  try {
    const data = await response.json() as { code?: string }
    return new Error(data.code ? `friendMatchError.${data.code}` : fallbackKey)
  } catch {
    return new Error(fallbackKey)
  }
}

export async function createFriendMatchInvite(friendUserId: number, boardSize: number, rules: MatchRulesDto): Promise<FriendMatchInvite> {
  const response = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/friend-invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendUserId, boardSize, rules }),
  })

  if (!response.ok) {
    throw await parseFriendMatchError(response, 'friendMatchInviteCreateError')
  }

  return await response.json() as FriendMatchInvite
}

async function getFriendMatchInvite(path: 'pending' | 'outgoing'): Promise<FriendMatchInvite | null> {
  const response = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/friend-invites/${path}`, {
    method: 'GET',
  })

  if (response.status === 204 || response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw await parseFriendMatchError(response, 'friendMatchInviteLoadError')
  }

  return await response.json() as FriendMatchInvite
}

export function getPendingFriendMatchInvite(): Promise<FriendMatchInvite | null> {
  return getFriendMatchInvite('pending')
}

export function getOutgoingFriendMatchInvite(): Promise<FriendMatchInvite | null> {
  return getFriendMatchInvite('outgoing')
}

export async function acceptFriendMatchInvite(inviteId: string): Promise<FriendMatchReady> {
  const response = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/friend-invites/${inviteId}/accept`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw await parseFriendMatchError(response, 'friendMatchInviteAcceptError')
  }

  return await response.json() as FriendMatchReady
}

export async function declineFriendMatchInvite(inviteId: string): Promise<void> {
  const response = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/friend-invites/${inviteId}/decline`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw await parseFriendMatchError(response, 'friendMatchInviteDeclineError')
  }
}
