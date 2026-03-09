import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test-utils";
import StatsUI from "../features/stats/ui/StatsUI";
import * as statsControllerModule from "../features/stats/hooks/useStatsController";

vi.mock("../features/stats/hooks/useStatsController");

describe("StatsUI Component", () => {
  const mockStats = {
    totalMatches: 10,
    wins: 6,
    losses: 4,
    matches: [
      {
        matchId: "1",
        createdAt: "2024-01-01T12:00:00Z",
        mode: "BOT",
        status: "WIN",
      },
      {
        matchId: "2",
        createdAt: "2024-01-02T12:00:00Z",
        mode: "PVP",
        status: "LOSS",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("userId", "test-user");
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("shows loading message", () => {
    vi.mocked(statsControllerModule.useStatsController).mockReturnValue({
      state: {
        stats: null,
        loading: true,
        error: null,
        isMocked: false,
      },
    } as any);

    renderWithProviders(<StatsUI />);

    expect(screen.getByText(/Cargando estadísticas/i)).toBeInTheDocument();
  });

  it("renders stats correctly", async () => {
    vi.mocked(statsControllerModule.useStatsController).mockReturnValue({
      state: {
        stats: mockStats,
        loading: false,
        error: null,
        isMocked: false,
      },
    } as any);

    renderWithProviders(<StatsUI />);

    expect(await screen.findByText(/Estadísticas del jugador/i)).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});