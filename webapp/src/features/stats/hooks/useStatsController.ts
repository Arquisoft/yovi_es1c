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

const MOCK_STATS: StatsDto = {
  totalMatches: 12,
  wins: 7,
  losses: 5,
  matches: [
    { matchId: "1", createdAt: "2026-03-01", mode: "BOT", status: "win" },
    { matchId: "2", createdAt: "2026-03-02", mode: "BOT", status: "lose" },
    { matchId: "3", createdAt: "2026-03-03", mode: "LOCAL_2P", status: "win" },
    { matchId: "4", createdAt: "2026-03-04", mode: "BOT", status: "lose" },
    { matchId: "5", createdAt: "2026-03-05", mode: "LOCAL_2P", status: "win" },
  ],
};

export const useStatsController = (userId: string) => {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMocked, setIsMocked] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    setIsMocked(false);

    try {
      const token = localStorage.getItem("jwt");

      const res = await fetchWithAuth(`${GAME_API_URL}/api/game/stats/${userId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) throw new Error(`Error obteniendo estadísticas: ${res.status}`);

      const data = await res.json();
      if (!data || !data.matches) {
        setStats(MOCK_STATS);
        setIsMocked(true);
      } else {
        setStats(data);
      }
    } catch (err) {
      console.warn(
        "No se pudo acceder a la API, usando datos mock:",
        err instanceof Error ? err.message : err
      );
      setStats(MOCK_STATS);
      setIsMocked(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [userId]);

  return {
    state: { stats, loading, error, isMocked },
    actions: { refresh: fetchStats },
  };
};