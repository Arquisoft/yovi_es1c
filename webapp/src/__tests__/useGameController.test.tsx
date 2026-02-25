import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { useGameController } from '../features/game/hooks/useGameController';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe('useGameController', () => {
    let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

    beforeEach(() => {
        vi.restoreAllMocks();

        fetchMock = vi.fn<FetchFn>();
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('alert', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('initializes with default state', () => {
        const { result } = renderHook(() => useGameController());

        expect(result.current.state.gameMode).toBe('BOT');
        expect(result.current.state.loading).toBe(false);
        expect(result.current.state.error).toBe(null);
        expect(result.current.state.gameOver).toBe(false);
        expect(result.current.state.message).toBe('Click a cell to play');
    });

    it('returns early while loading and when turn is not human in BOT mode', async () => {
        let resolveFetch: ((value: Response) => void) | undefined;
        fetchMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFetch = resolve;
                })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(true);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(1, 0);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);

        resolveFetch?.(
            new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
            expect(result.current.state.gameState.turn).toBe(0);
        });
    });

    it('returns early when game is over and when a cell is occupied', async () => {
        const { result } = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode('LOCAL_2P');
            result.current.actions.changeSize(1);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(fetchMock).not.toHaveBeenCalled();

        act(() => {
            result.current.actions.newGame();
            result.current.actions.changeSize(2);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        const layoutAfterFirstMove = result.current.state.gameState.layout;

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameState.layout).toBe(layoutAfterFirstMove);
    });

    it('handles LOCAL_2P turn alternation and finishing state', async () => {
        const { result } = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode('LOCAL_2P');
            result.current.actions.changeSize(2);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
            await result.current.actions.handleCellClick(1, 0);
            await result.current.actions.handleCellClick(1, 1);
        });

        expect(result.current.state.gameState.layout).toBe('B/RB');
        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toContain('¡Felicidades Jugador 1!');
        expect(result.current.state.isBoardFull).toBe(true);
    });

    it('handles LOCAL_2P winner and announces alert', async () => {
        const { result } = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode('LOCAL_2P');
            result.current.actions.changeSize(1);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toContain('¡Felicidades Jugador 1!');
        expect(window.alert).toHaveBeenCalledWith('¡Felicidades Jugador 1!');
    });

    it('handles BOT flow with valid response and bot move', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.current.state.gameState.turn).toBe(0);
        expect(result.current.state.message).toContain('Bot jugó en ('); // actualizado
    });

    it('handles BOT response with invalid coords', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 99, y: 0, z: 0 } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.gameState.turn).toBe(0);
        expect(result.current.state.message).toContain('Bot sugirió una celda inválida');
    });

    it('handles BOT non-ok response without reading body twice', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response('backend exploded', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' },
            })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.error).toBe('Bot error: backend exploded');
        expect(result.current.state.message).toBe('Error talking to bot');
        expect(result.current.state.gameState.turn).toBe(0);
    });

    it('handles BOT fetch rejection', async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network issue'));

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.error).toBe('Network issue');
        expect(result.current.state.message).toBe('Error talking to bot');
        expect(result.current.state.gameState.turn).toBe(0);
    });
});
