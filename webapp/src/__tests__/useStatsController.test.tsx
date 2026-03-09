import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useStatsController } from "../features/stats/hooks/useStatsController";
import * as fetchWithAuthModule from "../shared/api/fetchWithAuth";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("useStatsController", () => {

  let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

  beforeEach(() => {
    vi.restoreAllMocks();

    fetchMock = vi.fn<FetchFn>();

    vi.spyOn(fetchWithAuthModule, "fetchWithAuth").mockImplementation(fetchMock);

    localStorage.clear();
    localStorage.setItem("jwt", "test-token");
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("initializes with loading state", () => {
    const { result } = renderHook(() => useStatsController("user-1"));

    expect(result.current.state.loading).toBe(true);
    expect(result.current.state.stats).toBe(null);
    expect(result.current.state.error).toBe(null);
    expect(result.current.state.isMocked).toBe(false);
  });

  it("fetches stats successfully", async () => {
    const apiStats = {
      totalMatches: 20,
      wins: 12,
      losses: 8,
      matches: [],
    };

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(apiStats), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useStatsController("user-1"));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.state.stats).toEqual(apiStats);
    expect(result.current.state.isMocked).toBe(false);
  });

  it("uses mock data when API fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useStatsController("user-1"));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.stats?.totalMatches).toBe(12);
    expect(result.current.state.isMocked).toBe(true);
  });

  it("uses mock data when API returns error status", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Server error", { status: 500 })
    );

    const { result } = renderHook(() => useStatsController("user-1"));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.stats?.totalMatches).toBe(12);
    expect(result.current.state.isMocked).toBe(true);
  });

  it("calls API with Authorization header when jwt exists", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        totalMatches: 1,
        wins: 1,
        losses: 0,
        matches: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    renderHook(() => useStatsController("user-1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const callArgs = fetchMock.mock.calls[0];

    expect(callArgs[1]?.headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
  });

  it("does not include Authorization header when jwt missing", async () => {
    localStorage.removeItem("jwt");

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        totalMatches: 1,
        wins: 1,
        losses: 0,
        matches: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    renderHook(() => useStatsController("user-1"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const callArgs = fetchMock.mock.calls[0];

    expect(callArgs[1]?.headers).not.toHaveProperty("Authorization");
  });

  it("refresh action fetches stats again", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          totalMatches: 5,
          wins: 3,
          losses: 2,
          matches: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          totalMatches: 10,
          wins: 7,
          losses: 3,
          matches: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const { result } = renderHook(() => useStatsController("user-1"));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      await result.current.actions.refresh();
    });

    await waitFor(() => {
      expect(result.current.state.stats?.totalMatches).toBe(10);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

});