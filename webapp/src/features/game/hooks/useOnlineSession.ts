import { useEffect, useMemo, useState } from 'react';
import { fetchWithAuth } from '../../../shared/api/fetchWithAuth';
import { API_CONFIG } from '../../../config/api.config';
import { AUTH_STORAGE_KEYS } from '../../auth/constants/storage';
import { onlineSocketClient } from '../realtime/onlineSocketClient';
import type { ConnectionBadgeState } from '../realtime/onlineEvents';
import { v4 as uuidv4 } from 'uuid';

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

interface SessionErrorSocketPayload {
  code: string;
  message?: string;
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

/**
 * UI / i18n error codes (camelCase)
 */
type SessionErrorCode =
    | 'sessionNotFound'
    | 'sessionTerminal'
    | 'notAuthenticated'
    | 'socketError'
    | 'versionConflict'
    | 'notYourTurn'
    | 'invalidMove'
    | 'sessionError';

/**
 * Backend error codes (UPPER_CASE contract)
 */
type BackendSessionErrorCode =
    | 'VERSION_CONFLICT'
    | 'NOT_YOUR_TURN'
    | 'INVALID_MOVE'
    | 'SESSION_NOT_FOUND'
    | 'RECONNECT_EXPIRED'
    | 'SESSION_TERMINAL'
    | 'UNAUTHORIZED'
    | 'DUPLICATE_EVENT';

function mapSessionError(code?: BackendSessionErrorCode | string): SessionErrorCode {
  switch (code) {
    case 'SESSION_NOT_FOUND':
      return 'sessionNotFound';
    case 'SESSION_TERMINAL':
      return 'sessionTerminal';
    case 'UNAUTHORIZED':
      return 'notAuthenticated';
    case 'VERSION_CONFLICT':
      return 'versionConflict';
    case 'NOT_YOUR_TURN':
      return 'notYourTurn';
    case 'INVALID_MOVE':
      return 'invalidMove';
    default:
      return 'sessionError';
  }
}

export function useOnlineSession(matchId: string | null) {
  const [sessionState, setSessionState] = useState<OnlineSnapshotPayload | null>(null);
  const [error, setError] = useState<SessionErrorCode | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!matchId) return;

    let isMounted = true;
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);

    if (!token) {
      setError('notAuthenticated');
      return;
    }

    const loadSnapshot = async () => {
      try {
        const response = await fetchWithAuth(
            `${API_CONFIG.GAME_SERVICE_API}/online/sessions/${matchId}`,
            { method: 'GET' }
        );

        if (!response.ok) {
          let payload: SessionErrorSocketPayload | null = null;

          try {
            payload = await response.json();
          } catch {
            payload = null;
          }

          if (payload?.code) {
            setSessionState(null);
            setError(mapSessionError(payload.code));
            return;
          }

          if (response.status === 404) {
            setSessionState(null);
            setError('sessionNotFound');
          } else if (response.status === 409) {
            setSessionState(null);
            setError('sessionTerminal');
          } else {
            setError('sessionError');
          }

          return;
        }

        const payload = (await response.json()) as OnlineSnapshotPayload;
        if (!isMounted) return;

        setSessionState(payload);
        setError(null);
      } catch {
        setError('sessionError');
      }
    };

    void loadSnapshot();

    const socket = onlineSocketClient.connect(token);

    const handleConnect = () => {
      setIsConnected(true);
      onlineSocketClient.emit('match:join', {
        matchId,
        clientEventId: uuidv4(),
      });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const unsubscribeState = onlineSocketClient.on<SessionStateSocketPayload>(
        'session:state',
        (payload) => {
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
                    payload.players ?? [
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
              connectionStatus:
                  payload.connectionStatus ?? prev.connectionStatus ?? 'CONNECTED',
            };
          });

          setError(null);
        }
    );

    const unsubscribeError = onlineSocketClient.on<SessionErrorSocketPayload>(
        'session:error',
        (payload) => {
          setError(mapSessionError(payload?.code));
        }
    );

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
      clientEventId: uuidv4(),
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