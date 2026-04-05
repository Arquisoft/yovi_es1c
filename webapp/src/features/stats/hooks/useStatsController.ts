import { useEffect, useState } from "react";
import { API_CONFIG } from "../../../config/api.config";
import { fetchWithAuth } from "../../../shared/api/fetchWithAuth";

const GAME_API_URL = API_CONFIG.GAME_SERVICE_API;

export type MatchDto = {
  matchId: string;
  createdAt: string;
  mode: string;
  status: string;
};

export type StatsDto = {
  totalMatches: number;
  wins: number;
  losses: number;
  matches: MatchDto[];
};

export const useStatsController = (userId: string) => {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("jwt");

      const res = await fetchWithAuth(`${GAME_API_URL}/stats/${userId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) throw new Error(`Error obteniendo estadísticas: ${res.status}`);

      const apiData: StatsDto = await res.json();
      setStats(apiData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [userId]);

  return {
    state: { stats, loading, error },
    actions: { refresh: fetchStats },
  };
};