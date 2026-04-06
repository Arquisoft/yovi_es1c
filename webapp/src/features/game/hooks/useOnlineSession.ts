import { useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '../../../shared/api/fetchWithAuth';
import { API_CONFIG } from '../../../config/api.config';
import { AUTH_STORAGE_KEYS } from '../../auth/constants/storage';
import { onlineSocketClient } from '../realtime/onlineSocketClient';
import type { ConnectionBadgeState } from '../realtime/onlineEvents';

export interface OnlineSnapshotPayload {
  matchId: string;
  layout: string;
  size: number;
  turn: 0 | 1;
  version: number;
  timerEndsAt: number;
  players: [
    { userId: number; username: string; symbol: 'B' | 'R' },
    { userId: number; username: string; symbol: 'B' | 'R' }
  ];
  winner?: 'B' | 'R' | null;
  connectionStatus?: ConnectionBadgeState;
}

interface SessionErrorPayload {
  code:
      | 'VERSION_CONFLICT'
      | 'NOT_YOUR_TURN'
      | 'INVALID_MOVE'
      | 'SESSION_NOT_FOUND'
      | 'RECONNECT_EXPIRED'
      | 'SESSION_TERMINAL'
      | 'UNAUTHORIZED'
      | 'DUPLICATE_EVENT';
  message: string;
  details?: unknown;
}

interface SessionStateSocketPayload {
  matchId: string;
  layout: string;
  size?: number;
  turn: 0 | 1;
  version: number;
  timerEndsAt: number;
  players?: [
    { userId: number; username: string; symbol: 'B' | 'R' },
    { userId: number; username: string; symbol: 'B' | 'R' }
  ];
  winner?: 'B' | 'R' | null;
  connectionStatus?: ConnectionBadgeState;
}

export function useOnlineSession(matchId: string | null) {
  const [sessionState, setSessionState] = useState<OnlineSnapshotPayload | null>(null);
  const [error, setError] = useState<SessionErrorPayload | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!matchId) return;

    let isMounted = true;
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);

    if (!token) {
      setError({ code: 'SESSION_NOT_FOUND', message: 'Missing auth token' });
      return;
    }

    const loadSnapshot = async () => {
      const response = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/sessions/${matchId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        let payload: Partial<SessionErrorPayload> | null = null;
        try {
          payload = (await response.json()) as Partial<SessionErrorPayload>;
        } catch {
          payload = null;
        }

        const code = payload?.code;
        if (code) {
          setSessionState(null);
          setError({
            code,
            message: payload?.message ?? 'Online session request failed',
            details: payload?.details,
          });
          return;
        }

        if (response.status === 404) {
          setSessionState(null);
          setError({ code: 'SESSION_NOT_FOUND', message: 'Session not found' });
        } else if (response.status === 409) {
          setSessionState(null);
          setError({ code: 'SESSION_TERMINAL', message: 'Session is not active' });
        }
        return;
      }

      const payload = (await response.json()) as OnlineSnapshotPayload;
      if (!isMounted) return;

      setSessionState(payload);
      setError(null);
    };

    void loadSnapshot();

    const socket = onlineSocketClient.connect(token);

    const handleConnect = () => {
      setIsConnected(true);
      onlineSocketClient.emit('match:join', { matchId, clientEventId: crypto.randomUUID() });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const unsubscribeState = onlineSocketClient.on<SessionStateSocketPayload>('session:state', (payload) => {
      if (payload.matchId !== matchId) return;

      setSessionState((prev) => {
        if (!prev) {
          return {
            matchId: payload.matchId,
            layout: payload.layout,
            size: payload.size ?? 8,
            turn: payload.turn,
            version: payload.version,
            timerEndsAt: payload.timerEndsAt,
            players:
                payload.players ??
                [
                  { userId: 0, username: 'Player 1', symbol: 'B' },
                  { userId: 0, username: 'Player 2', symbol: 'R' },
                ],
            winner: payload.winner ?? null,
            connectionStatus: payload.connectionStatus ?? 'CONNECTED',
          };
        }

        return {
          ...prev,
          layout: payload.layout,
          size: payload.size ?? prev.size,
          turn: payload.turn,
          version: payload.version,
          timerEndsAt: payload.timerEndsAt,
          players: payload.players ?? prev.players,
          winner: payload.winner ?? prev.winner ?? null,
          connectionStatus: payload.connectionStatus ?? prev.connectionStatus ?? 'CONNECTED',
        };
      });

      setError(null);
    });

    const unsubscribeError = onlineSocketClient.on<SessionErrorPayload>('session:error', (payload) => {
      setError(payload);
    });

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      isMounted = false;
      unsubscribeState();
      unsubscribeError();
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      onlineSocketClient.disconnect();
    };
  }, [matchId]);

  const playMove = async (row: number, col: number) => {
    if (!sessionState || sessionState.winner) return;

    onlineSocketClient.emit('move:play', {
      matchId: sessionState.matchId,
      move: { row, col },
      expectedVersion: sessionState.version,
      clientEventId: crypto.randomUUID(),
    });
  };

  const connectionStatus = useMemo<ConnectionBadgeState>(() => {
    if (!sessionState?.connectionStatus) {
      return isConnected ? 'CONNECTED' : 'RECONNECTING';
    }
    return sessionState.connectionStatus;
  }, [isConnected, sessionState?.connectionStatus]);

  return {
    sessionState,
    error,
    isConnected,
    connectionStatus,
    playMove,
  };
}