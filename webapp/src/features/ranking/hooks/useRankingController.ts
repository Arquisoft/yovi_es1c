import { useCallback, useEffect, useState } from 'react';
import { API_CONFIG } from '../../../config/api.config';
import { fetchWithAuth } from '../../../shared/api/fetchWithAuth';

const GAME_API_URL = API_CONFIG.GAME_SERVICE_API;

export type LeaderboardEntry = {
  rank: number;
  userId: number;
  username: string | null;
  eloRating: number;
  gamesPlayed: number;
  peakRating: number;
  lastUpdated: string;
};

export type LeaderboardResponse = {
  total: number;
  limit: number;
  offset: number;
  entries: LeaderboardEntry[];
};

export type UserRankingDto = LeaderboardEntry;

export type UseRankingControllerOptions = {
  userId?: string | number | null;
  limit?: number;
  offset?: number;
};

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

export const useRankingController = (options: UseRankingControllerOptions = {}) => {
  const { userId, limit = DEFAULT_LIMIT, offset = DEFAULT_OFFSET } = options;
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [userRanking, setUserRanking] = useState<UserRankingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('jwt');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const leaderboardUrl = `${GAME_API_URL}/rankings?limit=${limit}&offset=${offset}`;
      const leaderboardRes = await fetchWithAuth(leaderboardUrl, { method: 'GET', headers });

      if (!leaderboardRes.ok) {
        throw new Error(`Error obteniendo ranking: ${leaderboardRes.status}`);
      }

      const leaderboardData: LeaderboardResponse = await leaderboardRes.json();
      setLeaderboard(leaderboardData);

      if (userId != null && userId !== '') {
        const userRes = await fetchWithAuth(`${GAME_API_URL}/rankings/${userId}`, {
          method: 'GET',
          headers,
        });
        if (userRes.status === 404) {
          setUserRanking(null);
        } else if (!userRes.ok) {
          throw new Error(`Error obteniendo ranking del usuario: ${userRes.status}`);
        } else {
          setUserRanking(await userRes.json());
        }
      } else {
        setUserRanking(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [userId, limit, offset]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    state: { leaderboard, userRanking, loading, error },
    actions: { refresh },
  };
};
