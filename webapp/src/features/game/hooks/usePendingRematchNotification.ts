import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchRulesDto } from '../../../shared/contracts';
import { fetchWithAuth } from '../../../shared/api/fetchWithAuth';
import { API_CONFIG } from '../../../config/api.config';
import { useAuth } from '../../auth';
import { onlineSocketClient } from '../realtime/onlineSocketClient';
import type {
    RematchDeclinedPayload,
    RematchReadyPayload,
    RematchRequestedPayload,
} from './useOnlineSession';

export interface PendingRematchNotification {
    matchId: string;
    requesterId?: number;
    requesterName: string;
    size?: number;
    rules?: MatchRulesDto;
    expiresAt?: number;
}

function normalizePendingRematch(payload: RematchRequestedPayload): PendingRematchNotification {
    return {
        matchId: payload.matchId,
        requesterId: payload.requesterId,
        requesterName: payload.requesterName,
        size: payload.size,
        rules: payload.rules,
        expiresAt: payload.expiresAt,
    };
}

export function usePendingRematchNotification(enabled: boolean) {
    const { token, user } = useAuth();
    const [pendingRematch, setPendingRematch] = useState<PendingRematchNotification | null>(null);
    const [readyRematch, setReadyRematch] = useState<RematchReadyPayload | null>(null);
    const pendingRef = useRef<PendingRematchNotification | null>(null);

    useEffect(() => {
        pendingRef.current = pendingRematch;
    }, [pendingRematch]);

    useEffect(() => {
        if (!enabled || !token || !user) {
            setPendingRematch(null);
            setReadyRematch(null);
            return;
        }

        let isMounted = true;

        const loadPendingRematch = async () => {
            try {
                const response = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/rematches/pending`, {
                    method: 'GET',
                });

                if (!isMounted) return;

                if (response.status === 204 || response.status === 404) {
                    setPendingRematch(null);
                    return;
                }

                if (!response.ok) return;

                const payload = (await response.json()) as PendingRematchNotification;
                setPendingRematch(payload);
            } catch (error) {
                console.error('[rematch] Could not load pending rematch', error);
            }
        };

        void loadPendingRematch();

        const socket = onlineSocketClient.connect(token);

        const unsubscribeRequested = onlineSocketClient.on<RematchRequestedPayload>(
            'rematch:requested',
            (payload) => {
                setPendingRematch(normalizePendingRematch(payload));
            },
        );

        const unsubscribeReady = onlineSocketClient.on<RematchReadyPayload>(
            'rematch:ready',
            (payload) => {
                setPendingRematch(null);
                setReadyRematch(payload);
            },
        );

        const unsubscribeDeclined = onlineSocketClient.on<RematchDeclinedPayload>(
            'rematch:declined',
            (payload) => {
                setPendingRematch((current) => (current?.matchId === payload.matchId ? null : current));
            },
        );

        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            isMounted = false;
            unsubscribeRequested();
            unsubscribeReady();
            unsubscribeDeclined();
            onlineSocketClient.disconnect();
        };
    }, [enabled, token, user]);

    const acceptPendingRematch = useCallback(() => {
        const current = pendingRef.current;
        if (!current) return;
        onlineSocketClient.emit('rematch:accept', { matchId: current.matchId });
    }, []);

    const declinePendingRematch = useCallback(() => {
        const current = pendingRef.current;
        if (!current) return;
        onlineSocketClient.emit('rematch:decline', { matchId: current.matchId });
        setPendingRematch(null);
    }, []);

    const clearReadyRematch = useCallback(() => {
        setReadyRematch(null);
    }, []);

    return {
        pendingRematch,
        readyRematch,
        acceptPendingRematch,
        declinePendingRematch,
        clearReadyRematch,
    };
}
