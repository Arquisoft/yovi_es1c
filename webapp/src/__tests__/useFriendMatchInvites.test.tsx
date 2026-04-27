import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFriendMatchInvites } from '../features/game/hooks/useFriendMatchInvites'
import { useAuth } from '../features/auth'
import { onlineSocketClient } from '../features/game/realtime/onlineSocketClient'
import {
  acceptFriendMatchInvite,
  declineFriendMatchInvite,
  getOutgoingFriendMatchInvite,
  getPendingFriendMatchInvite,
} from '../features/friends/api/friendMatchApi'

vi.mock('../features/auth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../features/friends/api/friendMatchApi', () => ({
  acceptFriendMatchInvite: vi.fn(),
  declineFriendMatchInvite: vi.fn(),
  getOutgoingFriendMatchInvite: vi.fn(),
  getPendingFriendMatchInvite: vi.fn(),
}))

vi.mock('../features/game/realtime/onlineSocketClient', () => ({
  onlineSocketClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
  },
}))

const socket = {
  connected: true,
  connect: vi.fn(),
}

const pendingInvite = {
  inviteId: 'pending-1',
  requesterId: 2,
  requesterName: 'Alberto',
  recipientId: 1,
  recipientName: 'David',
  boardSize: 8,
  rules: { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
  ranked: false,
  source: 'friend',
  status: 'pending',
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
}

const outgoingInvite = {
  ...pendingInvite,
  inviteId: 'outgoing-1',
  requesterId: 1,
  requesterName: 'David',
  recipientId: 2,
  recipientName: 'Alberto',
}

const readyMatch = {
  matchId: 'friend-match-1',
  boardSize: 8,
  size: 8,
  rules: pendingInvite.rules,
  ranked: false,
  source: 'friend',
  players: [
    { userId: 1, username: 'David', symbol: 'B' },
    { userId: 2, username: 'Alberto', symbol: 'R' },
  ],
}

function Harness({ enabled = true }: { enabled?: boolean }) {
  const state = useFriendMatchInvites(enabled)

  return (
    <div>
      <span data-testid="pending">{state.pendingFriendInvite?.inviteId ?? ''}</span>
      <span data-testid="outgoing">{state.outgoingFriendInvite?.inviteId ?? ''}</span>
      <span data-testid="ready">{state.readyFriendMatch?.matchId ?? ''}</span>
      <span data-testid="notice">{state.notice?.kind ?? ''}</span>
      <span data-testid="error">{state.errorKey ?? ''}</span>
      <button type="button" onClick={state.acceptPendingFriendInvite}>accept</button>
      <button type="button" onClick={state.declinePendingFriendInvite}>decline</button>
      <button type="button" onClick={state.cancelOutgoingFriendInvite}>cancel</button>
      <button type="button" onClick={state.clearReadyFriendMatch}>clear-ready</button>
      <button type="button" onClick={state.clearFriendMatchNotice}>clear-notice</button>
    </div>
  )
}

describe('useFriendMatchInvites', () => {
  let listeners: Record<string, (payload: any) => void>

  beforeEach(() => {
    vi.clearAllMocks()
    listeners = {}
    vi.mocked(useAuth).mockReturnValue({ token: 'token', user: { id: 1, username: 'David' } } as any)
    vi.mocked(getPendingFriendMatchInvite).mockResolvedValue(null)
    vi.mocked(getOutgoingFriendMatchInvite).mockResolvedValue(null)
    vi.mocked(acceptFriendMatchInvite).mockResolvedValue(readyMatch as any)
    vi.mocked(declineFriendMatchInvite).mockResolvedValue(undefined)
    vi.mocked(onlineSocketClient.connect).mockReturnValue(socket as any)
    vi.mocked(onlineSocketClient.on).mockImplementation((event: string, callback: (payload: any) => void) => {
      listeners[event] = callback
      return vi.fn()
    })
  })

  it('loads persisted incoming and outgoing invites and connects the socket', async () => {
    vi.mocked(getPendingFriendMatchInvite).mockResolvedValueOnce(pendingInvite as any)
    vi.mocked(getOutgoingFriendMatchInvite).mockResolvedValueOnce(outgoingInvite as any)

    render(<Harness />)

    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('pending-1'))
    expect(screen.getByTestId('outgoing')).toHaveTextContent('outgoing-1')
    expect(onlineSocketClient.connect).toHaveBeenCalledWith('token')
    expect(onlineSocketClient.on).toHaveBeenCalledWith('friend-match:invited', expect.any(Function))
    expect(onlineSocketClient.on).toHaveBeenCalledWith('friend-match:ready', expect.any(Function))
  })

  it('reacts to realtime invite, sent and ready events', async () => {
    render(<Harness />)
    await waitFor(() => expect(getPendingFriendMatchInvite).toHaveBeenCalled())

    act(() => listeners['friend-match:invited'](pendingInvite))
    expect(screen.getByTestId('pending')).toHaveTextContent('pending-1')

    act(() => listeners['friend-match:sent'](outgoingInvite))
    expect(screen.getByTestId('outgoing')).toHaveTextContent('outgoing-1')

    act(() => listeners['friend-match:ready'](readyMatch))
    expect(screen.getByTestId('pending')).toHaveTextContent('')
    expect(screen.getByTestId('outgoing')).toHaveTextContent('')
    expect(screen.getByTestId('ready')).toHaveTextContent('friend-match-1')

    fireEvent.click(screen.getByText('clear-ready'))
    expect(screen.getByTestId('ready')).toHaveTextContent('')
  })

  it('accepts, declines and cancels invites through the API', async () => {
    render(<Harness />)
    await waitFor(() => expect(getPendingFriendMatchInvite).toHaveBeenCalled())

    act(() => listeners['friend-match:invited'](pendingInvite))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('pending-1'))
    fireEvent.click(screen.getByText('accept'))
    await waitFor(() => expect(acceptFriendMatchInvite).toHaveBeenCalledWith('pending-1'))
    expect(screen.getByTestId('ready')).toHaveTextContent('friend-match-1')

    act(() => listeners['friend-match:invited'](pendingInvite))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('pending-1'))
    fireEvent.click(screen.getByText('decline'))
    await waitFor(() => expect(declineFriendMatchInvite).toHaveBeenCalledWith('pending-1'))
    expect(screen.getByTestId('pending')).toHaveTextContent('')

    act(() => listeners['friend-match:sent'](outgoingInvite))
    await waitFor(() => expect(screen.getByTestId('outgoing')).toHaveTextContent('outgoing-1'))
    fireEvent.click(screen.getByText('cancel'))
    await waitFor(() => expect(declineFriendMatchInvite).toHaveBeenCalledWith('outgoing-1'))
    expect(screen.getByTestId('outgoing')).toHaveTextContent('')
  })

  it('shows notices for declined, cancelled and expired events', async () => {
    render(<Harness />)
    await waitFor(() => expect(getPendingFriendMatchInvite).toHaveBeenCalled())

    act(() => listeners['friend-match:sent'](outgoingInvite))
    await waitFor(() => expect(screen.getByTestId('outgoing')).toHaveTextContent('outgoing-1'))
    act(() => listeners['friend-match:declined']({ inviteId: 'outgoing-1' }))
    expect(screen.getByTestId('notice')).toHaveTextContent('declined')
    expect(screen.getByTestId('outgoing')).toHaveTextContent('')

    fireEvent.click(screen.getByText('clear-notice'))
    expect(screen.getByTestId('notice')).toHaveTextContent('')

    act(() => listeners['friend-match:invited'](pendingInvite))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('pending-1'))
    act(() => listeners['friend-match:cancelled']({ inviteId: 'pending-1' }))
    expect(screen.getByTestId('notice')).toHaveTextContent('cancelled')

    act(() => listeners['friend-match:invited'](pendingInvite))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('pending-1'))
    act(() => listeners['friend-match:expired'](pendingInvite))
    expect(screen.getByTestId('notice')).toHaveTextContent('expired')
  })

  it('handles local sent events and load errors', async () => {
    vi.mocked(getPendingFriendMatchInvite).mockRejectedValueOnce(new Error('friendMatchInviteLoadError'))

    render(<Harness />)

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('friendMatchInviteLoadError'))

    act(() => {
      window.dispatchEvent(new CustomEvent('friend-match:sent-local', { detail: outgoingInvite }))
    })

    expect(screen.getByTestId('outgoing')).toHaveTextContent('outgoing-1')
  })

  it('clears state while disabled and avoids socket setup', async () => {
    vi.mocked(useAuth).mockReturnValue({ token: null, user: null } as any)

    render(<Harness enabled={false} />)

    expect(screen.getByTestId('pending')).toHaveTextContent('')
    expect(onlineSocketClient.connect).not.toHaveBeenCalled()
  })
})
