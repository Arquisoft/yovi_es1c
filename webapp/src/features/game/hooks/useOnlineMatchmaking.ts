import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const BOT_FALLBACK_TIMEOUT_MS = 30_000;

export function useOnlineMatchmaking(boardSize: number) {
  const [waiting, setWaiting] = useState(false);
  const [waitedSec, setWaitedSec] = useState(0);
  const [matched, setMatched] = useState<{ matchId: string; opponent: string; revealAfterGame: boolean } | null>(null);

  type OnlineError =
      | "notAuthenticated"
      | "socketConnectionFailed"
  const [error, setError] = useState<OnlineError | null>(null);

  const queueState = useMemo(() => (waiting ? 'searching' : 'idle'), [waiting]);
  const joinedRef = useRef(false);
  const joinedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchedRef = useRef<typeof matched>(null);

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
  }, [waiting, matched]);

  useEffect(() => {
    matchedRef.current = matched;
  }, [matched]);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      if (joinedRef.current) {
        onlineSocketClient.emit('queue:cancel');
      }
    };
  }, []);

  const joinQueue = useCallback(async () => {
    setError(null);
    setMatched(null);

    const token = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) {
      setError('notAuthenticated');
      return undefined;
    }

    const socket = onlineSocketClient.connect(token);

    const unsubscribeQueueStatus = onlineSocketClient.on<QueueStatusPayload>('queue:status', (payload) => {
      setWaiting(payload.state === 'queued' || payload.state === 'searching');
    });

    const unsubscribeMatched = onlineSocketClient.on<MatchmakingMatchedPayload>('matchmaking:matched', (payload) => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      setMatched({
        matchId: payload.matchId,
        opponent: payload.opponentPublic?.username ?? 'Unknown',
        revealAfterGame: Boolean(payload.revealAfterGame),
      });
      setWaiting(false);
      joinedRef.current = false;
    });

    const unsubscribeConnectError = onlineSocketClient.on<Error>('connect_error', () => {
      const error: OnlineError = 'socketConnectionFailed';

      setError(error);
      setWaiting(false);
    });

    const emitJoin = () => {
      onlineSocketClient.emit('queue:join', { boardSize });
      joinedRef.current = true;
      joinedAtRef.current = Date.now();
      setWaiting(true);
      setWaitedSec(0);

      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }

      fallbackTimerRef.current = setTimeout(() => {
        onlineSocketClient.emit('queue:cancel');
        joinedRef.current = false;
        setWaiting(false);
        setMatched({
          matchId: '__BOT_FALLBACK__',
          opponent: 'Bot',
          revealAfterGame: false,
        });
      }, BOT_FALLBACK_TIMEOUT_MS);
    };

    socket.off('connect', emitJoin);

    if (socket.connected) {
      emitJoin();
    } else {
      socket.once('connect', emitJoin);
    }

    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      socket.off('connect', emitJoin);
      unsubscribeQueueStatus();
      unsubscribeMatched();
      unsubscribeConnectError();
    };
  }, [boardSize]);

  const cancelQueue = useCallback(async () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    onlineSocketClient.emit('queue:cancel');
    joinedRef.current = false;
    joinedAtRef.current = null;
    setWaiting(false);
    setWaitedSec(0);
  }, []);

  return { waiting, waitedSec, matched, error, queueState, joinQueue, cancelQueue };
}