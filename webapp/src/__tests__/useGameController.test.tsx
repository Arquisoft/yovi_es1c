import {renderHook, waitFor} from "@testing-library/react";
import {act} from "react";
import {useGameController} from "../features/game/hooks/useGameController";
import {describe, it, expect, beforeEach, vi, afterEach} from "vitest";
import * as fetchWithAuthModule from "../shared/api/fetchWithAuth";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("useGameController", () => {
    let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

    beforeEach(() => {
        vi.restoreAllMocks();

        fetchMock = vi.fn<FetchFn>();

        vi.spyOn(fetchWithAuthModule, 'fetchWithAuth').mockImplementation(fetchMock);

        vi.stubGlobal("alert", vi.fn());
        localStorage.clear();
        localStorage.setItem("auth_token", "test-token");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it("initializes with default state", () => {
        const {result} = renderHook(() => useGameController());

        expect(result.current.state.gameMode).toBe("BOT");
        expect(result.current.state.loading).toBe(false);
        expect(result.current.state.error).toBe(null);
        expect(result.current.state.gameOver).toBe(false);
        expect(result.current.state.message).toBe("Click a cell to play");
        expect(result.current.state.isBoardFull).toBe(false);
    });

    it("does nothing if loading is true", async () => {
        let resolveFetch!: (value: Response) => void;

        fetchMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFetch = resolve;
                })
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(true);
        });

        await act(async () => {
            result.current.actions.handleCellClick(1, 0);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);

        resolveFetch(
            new Response(JSON.stringify({coords: {x: 6, y: 0, z: 1}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });
    });

    it("does nothing if game is over", async () => {
        const {result} = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
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
    });

    it("does nothing if cell is occupied", async () => {
        const {result} = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
            result.current.actions.changeSize(2);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        const layoutBefore = result.current.state.gameState.layout;

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameState.layout).toBe(layoutBefore);
    });

    it("handles LOCAL_2P turn alternation", async () => {
        const {result} = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
            result.current.actions.changeSize(2);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.message).toContain("Jugador 2");

        await act(async () => {
            await result.current.actions.handleCellClick(1, 0);
        });

        expect(result.current.state.message).toContain("Jugador 1");
    });

    it("handles BOT valid response", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({coords: {x: 6, y: 0, z: 1}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.current.state.gameState.turn).toBe(0);
        expect(result.current.state.message).toContain("Bot jugó en");
    });

    it("handles BOT response without coords gracefully", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({message: "invalid"}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error).toBe("Respuesta inválida del bot.");
            expect(result.current.state.message).toBe("Error comunicando con el bot");
            expect(result.current.state.loading).toBe(false);
        });
    });

    it("handles BOT invalid coords", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({coords: {x: 999, y: 999, z: 999}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.message).toContain("Bot sugirió una celda inválida");
        expect(result.current.state.gameState.turn).toBe(0);
    });

    it("handles BOT error response", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("backend exploded", {
                status: 500,
            })
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.error).toBe("Error del bot: backend exploded");
        expect(result.current.state.message).toBe("Error comunicando con el bot");
        expect(result.current.state.gameState.turn).toBe(0);
    });

    it("handles fetch rejection", async () => {
        fetchMock.mockRejectedValueOnce(new Error("Network issue"));

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.error).toBe("Network issue");
        expect(result.current.state.message).toBe("Error comunicando con el bot");
        expect(result.current.state.gameState.turn).toBe(0);
    });

    it("changeSize resets board correctly", () => {
        const {result} = renderHook(() => useGameController());

        act(() => {
            result.current.actions.changeSize(3);
        });

        expect(result.current.state.gameState.size).toBe(3);
        expect(result.current.state.gameOver).toBe(false);
        expect(result.current.state.error).toBe(null);
    });

    it("newGame resets state", () => {
        const {result} = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
        });

        act(() => {
            result.current.actions.newGame();
        });

        expect(result.current.state.gameOver).toBe(false);
        expect(result.current.state.error).toBe(null);
        expect(result.current.state.message).toBe("Click a cell to play");
    });

    it("persistMove is called when matchId exists", async () => {
        fetchMock
            .mockResolvedValueOnce(
                new Response(JSON.stringify({coords: {x: 6, y: 0, z: 1}}), {
                    status: 200,
                    headers: {"Content-Type": "application/json"},
                })
            )
            .mockResolvedValueOnce(new Response(null, {status: 200}));

        const {result} = renderHook(() =>
            useGameController(8, "BOT", undefined, "match-123")
        );

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        const persistCall = fetchMock.mock.calls.find(([url]) =>
            (url as string).includes("/api/game/matches/match-123/moves")
        );

        expect(persistCall).toBeTruthy();
        expect((persistCall![0] as string)).toContain(
            "/api/game/matches/match-123/moves"
        );
    });

    it("handles 401 bot error", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("", {status: 401})
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error)
                .toBe("No estás autenticado. Por favor inicia sesión.");
        });
    });

    it("handles 400 bot error", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("", {status: 400})
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error)
                .toBe("Movimiento inválido enviado al servidor.");
        });
    });

    it("handles 409 bot error", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("", {status: 409})
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error)
                .toBe("Juego ya ha terminado o conflicto de estado.");
        });
    });

    it("sets Authorization header when auth token exists", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({coords: {x: 6, y: 0, z: 1}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        const {result} = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
            const callArgs = fetchMock.mock.calls[0];
            expect(callArgs[0]).toBe('/api/gamey/v1/ybot/choose/random_bot');
        });
    });


    it("handles human player winning in BOT mode", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({coords: {x: 6, y: 0, z: 1}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        const {result} = renderHook(() => useGameController(1));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("¡Felicidades Jugador 1!");
    });

    it("handles bot winning", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({coords: {x: 0, y: 0, z: 0}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        const {result} = renderHook(() => useGameController(2));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        const {result: result2} = renderHook(() => useGameController(3));

        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({coords: {x: 1, y: 0, z: 0}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        await act(async () => {
            await result2.current.actions.handleCellClick(2, 2);
        });
    });

    it("detects board full draw after human move in BOT mode", async () => {
        const yenModule = await import("../features/game/domain/yen");
        const checkWinnerSpy = vi.spyOn(yenModule, "checkWinner");

        checkWinnerSpy.mockReturnValue(false);

        const {result} = renderHook(() => useGameController(1));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("Board full — game over");

        vi.restoreAllMocks();
    });

    it("handles bot move to occupied cell gracefully", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({coords: {x: 0, y: 0, z: 0}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        const {result} = renderHook(() => useGameController(2));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });
        expect(result.current.state.message).toBe("Bot sugirió una celda inválida, vuelve a jugar");
        expect(result.current.state.gameState.turn).toBe(0);
    });

    it("does not call bot when not in BOT mode", async () => {
        const {result} = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("detects board full draw in LOCAL_2P mode", async () => {
        vi.spyOn(await import("../features/game/domain/yen"), "checkWinner").mockReturnValue(false);

        const {result} = renderHook(() => useGameController(2));

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(1, 0);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(1, 1);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("Board full — game over");

        vi.restoreAllMocks();
    });





    it("handles persist error gracefully when matchId exists", async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        let callCount = 0;
        vi.spyOn(fetchWithAuthModule, 'fetchWithAuth').mockImplementation(async (url) => {
            const urlString = url.toString();

            if (urlString.includes('/ybot/')) {
                return new Response(JSON.stringify({coords: {x: 6, y: 0, z: 1}}), {
                    status: 200,
                    headers: {"Content-Type": "application/json"},
                });
            }

            if (urlString.includes('/moves')) {
                callCount++;
                if (callCount === 1) {
                    throw new Error("Database connection failed");
                }
                return new Response(null, {status: 200});
            }

            return new Response(null, {status: 404});
        });

        const {result} = renderHook(() =>
            useGameController(8, "BOT", undefined, "match-123")
        );

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Persist error:",
            expect.any(Error)
        );

        expect(result.current.state.message).toContain("Bot jugó en");

        consoleErrorSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it("bot plays without winning - normal game flow", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({coords: {x: 6, y: 1, z: 0}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            })
        );

        const {result} = renderHook(() => useGameController(8));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        expect(result.current.state.gameOver).toBe(false);
        expect(result.current.state.message).toMatch(/Bot jugó en \(\d+, \d+\) — tu turno/);
        expect(result.current.state.error).toBe(null);
    });

    it("detects LOCAL_2P winner with player 2", async () => {
        const {result} = renderHook(() => useGameController(1));

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("¡Felicidades Jugador 1!");
        expect(window.alert).toHaveBeenCalledWith("¡Felicidades Jugador 1!");
    });
});
