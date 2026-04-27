import { useEffect, useState } from 'react';
import { API_CONFIG } from '../../../config/api.config';
import { fetchWithAuth } from '../../../shared/api/fetchWithAuth';
import { useAuth } from '../../auth/context/useAuth';
import {useTranslation} from "react-i18next";
import type { MatchRulesDto } from '../../../shared/contracts';

interface ActiveSessionResponse {
  matchId: string;
  boardSize: number;
  status?: string;
  reconnectDeadline?: number | null;
  ranked?: boolean;
  source?: 'matchmaking' | 'friend';
  rules?: MatchRulesDto;
  opponent?: {
    userId: number;
    username: string;
  } | null;
}

export function useActiveSession() {
  const { token } = useAuth();
  const [matchId, setMatchId] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [source, setSource] = useState<'matchmaking' | 'friend' | null>(null);
  const [opponent, setOpponent] = useState<ActiveSessionResponse['opponent']>(null);
  const [rules, setRules] = useState<MatchRulesDto | null>(null);
  const {t} = useTranslation();

  useEffect(() => {
    let isMounted = true;
    if (!token) {
      setMatchId(null);
      setBoardSize(null);
      setLoading(false);
      setError(null);
      setStatus(null);
      setSource(null);
      setOpponent(null);
      setRules(null);
      return;
    }

    const fetchActiveSession = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/sessions/active`, {
          method: 'GET',
        });

        if (!isMounted) return;

        if (response.status === 204) {
          setMatchId(null);
          setBoardSize(null);
          setStatus(null);
          setSource(null);
          setOpponent(null);
          setRules(null);
          return;
        }

        if (!response.ok) {
          throw new Error(t('activeSessionCouldNotBeChecked'));
        }

        const data = (await response.json()) as ActiveSessionResponse;
        if (!isMounted) return;
        setMatchId(data.matchId);
        setBoardSize(data.boardSize);
        setStatus(data.status ?? null);
        setSource(data.source ?? 'matchmaking');
        setOpponent(data.opponent ?? null);
        setRules(data.rules ?? null);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : t('networkError'));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchActiveSession();
    return () => {
      isMounted = false;
    };
  }, [token, t]);

  return { matchId, boardSize, loading, error, status, source, opponent, rules };
}
