import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth'
import { onlineSocketClient } from '../realtime/onlineSocketClient'
import {
  acceptFriendMatchInvite,
  declineFriendMatchInvite,
  getOutgoingFriendMatchInvite,
  getPendingFriendMatchInvite,
  type FriendMatchInvite,
  type FriendMatchReady,
} from '../../friends/api/friendMatchApi'

export type FriendMatchNoticeKind = 'declined' | 'cancelled' | 'expired'

export type FriendMatchNotice = {
  kind: FriendMatchNoticeKind
  invite: FriendMatchInvite | null
}

type FriendMatchInviteEvent = FriendMatchInvite | { inviteId: string }

function sameInvite(current: FriendMatchInvite | null, payload: FriendMatchInviteEvent): boolean {
  return Boolean(current && current.inviteId === payload.inviteId)
}

function hasFullInvite(payload: FriendMatchInviteEvent): payload is FriendMatchInvite {
  return 'requesterId' in payload && 'recipientId' in payload
}

export function useFriendMatchInvites(enabled: boolean) {
  const { token, user } = useAuth()
  const [pendingFriendInvite, setPendingFriendInvite] = useState<FriendMatchInvite | null>(null)
  const [outgoingFriendInvite, setOutgoingFriendInvite] = useState<FriendMatchInvite | null>(null)
  const [readyFriendMatch, setReadyFriendMatch] = useState<FriendMatchReady | null>(null)
  const [notice, setNotice] = useState<FriendMatchNotice | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const pendingRef = useRef<FriendMatchInvite | null>(null)
  const outgoingRef = useRef<FriendMatchInvite | null>(null)

  useEffect(() => {
    pendingRef.current = pendingFriendInvite
  }, [pendingFriendInvite])

  useEffect(() => {
    outgoingRef.current = outgoingFriendInvite
  }, [outgoingFriendInvite])

  useEffect(() => {
    const candidates = [pendingFriendInvite, outgoingFriendInvite].filter((invite): invite is FriendMatchInvite => Boolean(invite))
    if (candidates.length === 0) return

    const nextExpiration = Math.min(...candidates.map((invite) => invite.expiresAt))
    const delayMs = Math.max(0, nextExpiration - Date.now())

    const timer = window.setTimeout(() => {
      const pending = pendingRef.current
      const outgoing = outgoingRef.current

      if (pending && pending.expiresAt <= Date.now()) {
        setPendingFriendInvite(null)
        setNotice({ kind: 'expired', invite: pending })
      }
      if (outgoing && outgoing.expiresAt <= Date.now()) {
        setOutgoingFriendInvite(null)
        setNotice({ kind: 'expired', invite: outgoing })
      }
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [pendingFriendInvite, outgoingFriendInvite])

  useEffect(() => {
    if (!enabled || !token || !user) {
      setPendingFriendInvite(null)
      setOutgoingFriendInvite(null)
      setReadyFriendMatch(null)
      setNotice(null)
      setErrorKey(null)
      return
    }

    let mounted = true

    const loadInvites = async () => {
      try {
        const [pending, outgoing] = await Promise.all([
          getPendingFriendMatchInvite(),
          getOutgoingFriendMatchInvite(),
        ])

        if (mounted) {
          setPendingFriendInvite(pending)
          setOutgoingFriendInvite(outgoing)
          setErrorKey(null)
        }
      } catch (error) {
        if (mounted) {
          setErrorKey(error instanceof Error ? error.message : 'friendMatchInviteLoadError')
        }
      }
    }

    void loadInvites()

    const socket = onlineSocketClient.connect(token)

    const unsubscribeInvited = onlineSocketClient.on<FriendMatchInvite>('friend-match:invited', (payload) => {
      setPendingFriendInvite(payload)
      setNotice(null)
      setErrorKey(null)
    })

    const unsubscribeSent = onlineSocketClient.on<FriendMatchInvite>('friend-match:sent', (payload) => {
      setOutgoingFriendInvite(payload)
      setNotice(null)
      setErrorKey(null)
    })

    const unsubscribeReady = onlineSocketClient.on<FriendMatchReady>('friend-match:ready', (payload) => {
      setPendingFriendInvite(null)
      setOutgoingFriendInvite(null)
      setNotice(null)
      setReadyFriendMatch(payload)
      setErrorKey(null)
    })

    const unsubscribeDeclined = onlineSocketClient.on<FriendMatchInviteEvent>('friend-match:declined', (payload) => {
      const current = outgoingRef.current
      if (sameInvite(current, payload)) {
        setOutgoingFriendInvite(null)
        setNotice({ kind: 'declined', invite: hasFullInvite(payload) ? payload : current })
      }
    })

    const unsubscribeCancelled = onlineSocketClient.on<FriendMatchInviteEvent>('friend-match:cancelled', (payload) => {
      const current = pendingRef.current
      if (sameInvite(current, payload)) {
        setPendingFriendInvite(null)
        setNotice({ kind: 'cancelled', invite: hasFullInvite(payload) ? payload : current })
      }
    })

    const unsubscribeExpired = onlineSocketClient.on<FriendMatchInviteEvent>('friend-match:expired', (payload) => {
      const pending = pendingRef.current
      const outgoing = outgoingRef.current
      if (sameInvite(pending, payload)) {
        setPendingFriendInvite(null)
        setNotice({ kind: 'expired', invite: hasFullInvite(payload) ? payload : pending })
      }
      if (sameInvite(outgoing, payload)) {
        setOutgoingFriendInvite(null)
        setNotice({ kind: 'expired', invite: hasFullInvite(payload) ? payload : outgoing })
      }
    })

    const handleLocalSent = (event: Event) => {
      const detail = (event as CustomEvent<FriendMatchInvite>).detail
      if (detail?.inviteId) {
        setOutgoingFriendInvite(detail)
        setNotice(null)
        setErrorKey(null)
      }
    }

    window.addEventListener('friend-match:sent-local', handleLocalSent)

    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      mounted = false
      unsubscribeInvited()
      unsubscribeSent()
      unsubscribeReady()
      unsubscribeDeclined()
      unsubscribeCancelled()
      unsubscribeExpired()
      window.removeEventListener('friend-match:sent-local', handleLocalSent)
      onlineSocketClient.disconnect()
    }
  }, [enabled, token, user])

  const acceptPendingFriendInvite = useCallback(async () => {
    const current = pendingRef.current
    if (!current) return
    try {
      const ready = await acceptFriendMatchInvite(current.inviteId)
      setPendingFriendInvite(null)
      setOutgoingFriendInvite(null)
      setReadyFriendMatch(ready)
      setNotice(null)
      setErrorKey(null)
    } catch (error) {
      setErrorKey(error instanceof Error ? error.message : 'friendMatchInviteAcceptError')
    }
  }, [])

  const declinePendingFriendInvite = useCallback(async () => {
    const current = pendingRef.current
    if (!current) return
    try {
      await declineFriendMatchInvite(current.inviteId)
      setPendingFriendInvite(null)
      setNotice(null)
      setErrorKey(null)
    } catch (error) {
      setErrorKey(error instanceof Error ? error.message : 'friendMatchInviteDeclineError')
    }
  }, [])

  const cancelOutgoingFriendInvite = useCallback(async () => {
    const current = outgoingRef.current
    if (!current) return
    try {
      await declineFriendMatchInvite(current.inviteId)
      setOutgoingFriendInvite(null)
      setNotice(null)
      setErrorKey(null)
    } catch (error) {
      setErrorKey(error instanceof Error ? error.message : 'friendMatchInviteDeclineError')
    }
  }, [])

  const clearReadyFriendMatch = useCallback(() => {
    setReadyFriendMatch(null)
  }, [])

  const clearFriendMatchNotice = useCallback(() => {
    setNotice(null)
  }, [])

  return {
    pendingFriendInvite,
    outgoingFriendInvite,
    readyFriendMatch,
    notice,
    errorKey,
    acceptPendingFriendInvite,
    declinePendingFriendInvite,
    cancelOutgoingFriendInvite,
    clearReadyFriendMatch,
    clearFriendMatchNotice,
  }
}
