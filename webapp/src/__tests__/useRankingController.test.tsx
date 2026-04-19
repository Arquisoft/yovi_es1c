import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRankingController } from '../features/ranking/hooks/useRankingController';
import * as fetchWithAuthModule from '../shared/api/fetchWithAuth';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('useRankingController', () => {
  let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.fn<FetchFn>();
    vi.spyOn(fetchWithAuthModule, 'fetchWithAuth').mockImplementation(fetchMock);
    localStorage.clear();
    localStorage.setItem('jwt', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts loading and fetches both leaderboard and user ranking', async () => {
    const leaderboard = {
      total: 1,
      limit: 20,
      offset: 0,
      entries: [
        { rank: 1, userId: 42, username: 'alice', eloRating: 1600, gamesPlayed: 10, peakRating: 1650, lastUpdated: 'now' },
      ],
    };
    const userRanking = {
      rank: 1, userId: 42, username: 'alice', eloRating: 1600, gamesPlayed: 10, peakRating: 1650, lastUpdated: 'now',
    };

    fetchMock.mockResolvedValueOnce(jsonResponse(leaderboard));
    fetchMock.mockResolvedValueOnce(jsonResponse(userRanking));

    const { result } = renderHook(() => useRankingController({ userId: 42 }));

    expect(result.current.state.loading).toBe(true);

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(result.current.state.leaderboard).toEqual(leaderboard);
    expect(result.current.state.userRanking).toEqual(userRanking);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/rankings?limit=20&offset=0');
    expect(fetchMock.mock.calls[1][0]).toContain('/rankings/42');
  });

  it('treats a 404 on user ranking as "no ranking yet" without error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, limit: 20, offset: 0, entries: [] }));
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    const { result } = renderHook(() => useRankingController({ userId: 42 }));

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(result.current.state.error).toBeNull();
    expect(result.current.state.userRanking).toBeNull();
  });

  it('skips the per-user fetch when no userId is supplied', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, limit: 20, offset: 0, entries: [] }));

    const { result } = renderHook(() => useRankingController({}));

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.state.userRanking).toBeNull();
  });


  it('surfaces errors when the leaderboard request fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    const { result } = renderHook(() => useRankingController({}));

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(result.current.state.error).toContain('500');
    expect(result.current.state.leaderboard).toBeNull();
  });

  it('honours custom limit and offset query params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, limit: 5, offset: 40, entries: [] }));

    renderHook(() => useRankingController({ limit: 5, offset: 40 }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock.mock.calls[0][0]).toContain('limit=5');
    expect(fetchMock.mock.calls[0][0]).toContain('offset=40');
  });

  it('refresh re-fetches the leaderboard', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ total: 0, limit: 20, offset: 0, entries: [] }))
      .mockResolvedValueOnce(jsonResponse({
        total: 1,
        limit: 20,
        offset: 0,
        entries: [{ rank: 1, userId: 1, username: 'solo', eloRating: 1500, gamesPlayed: 3, peakRating: 1500, lastUpdated: 'now' }],
      }));

    const { result } = renderHook(() => useRankingController({}));

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    await act(async () => {
      await result.current.actions.refresh();
    });

    await waitFor(() => expect(result.current.state.leaderboard?.total).toBe(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
