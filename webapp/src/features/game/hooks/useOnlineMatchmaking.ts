import { useEffect, useMemo, useRef, useState } from 'react';
import { AUTH_STORAGE_KEYS } from '../../auth/constants/storage';
import { onlineSocketClient } from '../realtime/onlineSocketClient';

interface QueueStatusPayload {
  state: 'queued' | 'searching';
  queuePosition?: number;
  waitedSec: number;
}

interface MatchmakingMatchedPayload {
  matchId: string;
  opponentPublic: { username: string };
  revealAfterGame: boolean;
}

export function useOnlineMatchmaking(boardSize: number) {
  const [waiting, setWaiting] = useState(false);
  const [waitedSec, setWaitedSec] = useState(0);
  const [matched, setMatched] = useState<{ matchId: string; opponent: string; revealAfterGame: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queueState = useMemo(() => (waiting ? 'searching' : 'idle'), [waiting]);
  const joinedRef = useRef(false);
  const joinedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null); // ← NUEVO

  useEffect(() => {
    if (waiting) {
      joinedAtRef.current = joinedAtRef.current ?? Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (joinedAtRef.current ?? Date.now())) / 1000);
        setWaitedSec(elapsed);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (!matched) {
        joinedAtRef.current = null;
        setWaitedSec(0);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [waiting]);


  useEffect(() => {
    return () => {
      if (joinedRef.current) {
        onlineSocketClient.emit('queue:cancel');
      }
      onlineSocketClient.disconnect();
    };
  }, []);

  const joinQueue = async () => {
    setError(null);
    setMatched(null);

    const token = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) {
      setError('Not authenticated. Please log in again.');
      return;
    }

    const socket = onlineSocketClient.connect(token);

    const unsubscribeQueueStatus = onlineSocketClient.on<QueueStatusPayload>('queue:status', (payload) => {
      setWaiting(payload.state === 'queued' || payload.state === 'searching');
      // Ya no usamos payload.waitedSec para mostrar; el contador local es más preciso
    });

    const unsubscribeMatched = onlineSocketClient.on<MatchmakingMatchedPayload>('matchmaking:matched', (payload) => {
      setMatched({
        matchId: payload.matchId,
        opponent: payload.opponentPublic?.username ?? 'Unknown',
        revealAfterGame: Boolean(payload.revealAfterGame),
      });
      setWaiting(false);
      joinedRef.current = false;
    });

    const unsubscribeConnectError = onlineSocketClient.on<Error>('connect_error', (payload) => {
      const message = payload instanceof Error ? payload.message : 'Socket connection failed';
      setError(message);
      setWaiting(false);
    });

    const emitJoin = () => {
      onlineSocketClient.emit('queue:join', { boardSize });
      joinedRef.current = true;
      joinedAtRef.current = Date.now(); // ← registramos el momento exacto de entrada
      setWaiting(true);
      setWaitedSec(0);
    };

    if (socket.connected) {
      emitJoin();
    } else {
      socket.once('connect', emitJoin);
    }

    return () => {
      unsubscribeQueueStatus();
      unsubscribeMatched();
      unsubscribeConnectError();
    };
  };

  const cancelQueue = async () => {
    onlineSocketClient.emit('queue:cancel');
    joinedRef.current = false;
    joinedAtRef.current = null;
    setWaiting(false);
    setWaitedSec(0);
  };

  return { waiting, waitedSec, matched, error, queueState, joinQueue, cancelQueue };
}
