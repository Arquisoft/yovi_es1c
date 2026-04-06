import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { useGameController } from "../features/game/hooks/useGameController";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as fetchWithAuthModule from "../shared/api/fetchWithAuth";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("useGameController", () => {
    let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

    beforeEach(() => {
        vi.restoreAllMocks();

        fetchMock = vi.fn<FetchFn>();
        vi.spyOn(fetchWithAuthModule, "fetchWithAuth").mockImplementation(fetchMock);

        vi.stubGlobal("alert", vi.fn());
        localStorage.clear();
        localStorage.setItem("auth_token", "test-token");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it("initializes with default state", () => {
        const { result } = renderHook(() => useGameController());

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

        const { result } = renderHook(() => useGameController());

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
            new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });
    });

    it("does nothing if game is over", async () => {
        const { result } = renderHook(() => useGameController());

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
        const { result } = renderHook(() => useGameController());

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
        const { result } = renderHook(() => useGameController());

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
            new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
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
        expect(result.current.state.message).toContain("Bot jugó en");
    });

    it("handles BOT response without coords gracefully", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ message: "invalid" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error).toBe("Error del bot: invalid");
            expect(result.current.state.message).toBe("Error comunicando con el bot");
            expect(result.current.state.loading).toBe(false);
        });
    });

    it("handles BOT invalid coords", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 999, y: 999, z: 999 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController());

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

        const { result } = renderHook(() => useGameController());

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

    it("falls back from expert to hard when expert returns 5xx", async () => {
        fetchMock
            .mockResolvedValueOnce(new Response("gamey unavailable", { status: 503 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            );

        const { result } = renderHook(() => useGameController(8, "BOT", undefined, undefined, "expert"));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => expect(result.current.state.loading).toBe(false));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/choose/expert");
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/choose/hard");
    });

    it("returns timeout message when gamey call aborts", async () => {
        const timeoutError = new Error("aborted");
        timeoutError.name = "AbortError";
        fetchMock.mockRejectedValue(timeoutError);

        const { result } = renderHook(() => useGameController(8, "BOT", undefined, undefined, "expert"));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => expect(result.current.state.loading).toBe(false));
        expect(result.current.state.error).toBe("Timeout comunicando con gamey");
    });

    it("handles fetch rejection", async () => {
        fetchMock.mockRejectedValueOnce(new Error("Network issue"));

        const { result } = renderHook(() => useGameController());

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
        const { result } = renderHook(() => useGameController());

        act(() => {
            result.current.actions.changeSize(3);
        });

        expect(result.current.state.gameState.size).toBe(3);
        expect(result.current.state.gameOver).toBe(false);
        expect(result.current.state.error).toBe(null);
    });

    it("newGame resets state", () => {
        const { result } = renderHook(() => useGameController());

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
                new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            )
            .mockResolvedValueOnce(new Response(null, { status: 200 }));

        const { result } = renderHook(() =>
            useGameController(8, "BOT", undefined, "match-123")
        );

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        const persistCall = fetchMock.mock.calls.find(([url]) =>
            String(url).includes("/api/game/matches/match-123/moves")
        );

        expect(persistCall).toBeTruthy();
        expect(String(persistCall![0])).toContain("/api/game/matches/match-123/moves");
    });

    it("handles 401 bot error", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("", { status: 401 })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error).toBe("No estás autenticado. Por favor inicia sesión.");
            expect(result.current.state.loading).toBe(false);
        });
    });

    it("handles 400 bot error", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("", { status: 400 })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error).toBe("Movimiento inválido enviado al servidor.");
        });
    });

    it("handles 409 bot error", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response("", { status: 409 })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error).toBe("Juego ya ha terminado o conflicto de estado.");
            expect(result.current.state.loading).toBe(false);
        });
    });

    it("calls easy bot endpoint by default", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
        });

        const callArgs = fetchMock.mock.calls[0];
        expect(callArgs[0]).toBe("/api/gamey/v1/ybot/choose/easy");
    });

    it("handles human player winning in BOT mode", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController(1));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("¡Felicidades Jugador 1!");
    });

    it("handles bot winning", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 0, y: 0, z: 0 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController(2));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.loading).toBe(false);
        });

        const { result: result2 } = renderHook(() => useGameController(3));

        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 1, y: 0, z: 0 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        await act(async () => {
            await result2.current.actions.handleCellClick(2, 2);
        });
    });

    /**
     * El juego Y no puede terminar en empate por teorema matemático: un tablero
     * lleno siempre contiene un ganador. Por ello se verifica que, al jugar en la
     * última celda libre en modo BOT, el juego termina con un ganador (nunca con
     * "Board full — game over") y que el bot no llega a ser invocado.
     */
    it("BOT mode: human wins on last cell, game ends without calling bot", async () => {
        const { result } = renderHook(() => useGameController(1));

        // Tablero de tamaño 1 → una única celda; jugar ahí gana al instante.
        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("¡Felicidades Jugador 1!");
        // El bot no debe ser invocado tras una victoria humana.
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("handles bot move to occupied cell gracefully", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 0, y: 0, z: 0 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController(2));

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
        const { result } = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    /**
     * El juego Y no tiene empates. Se verifica que al llenar el tablero en modo
     * LOCAL_2P el último jugador en conectar los tres lados gana correctamente.
     * (El camino de código "Board full — game over" es inalcanzable por diseño
     * del juego.)
     */
    it("LOCAL_2P: last move on a full board produces a winner, not a draw", async () => {
        // Tablero 2×2 (3 celdas). Jugador 1 rellena (0,0) y (1,1);
        // ambas celdas forman un componente que toca los tres ejes → gana.
        const { result } = renderHook(() => useGameController(2));
        act(() => result.current.actions.selectMode("LOCAL_2P"));

        // Jugador 1 juega (0,0)
        await act(async () => result.current.actions.handleCellClick(0, 0));
        expect(result.current.state.gameOver).toBe(false);

        // Jugador 2 juega (1,0)
        await act(async () => result.current.actions.handleCellClick(1, 0));
        expect(result.current.state.gameOver).toBe(false);

        // Jugador 1 juega (1,1) → tablero lleno y jugador 1 gana
        await act(async () => result.current.actions.handleCellClick(1, 1));

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("¡Felicidades Jugador 1!");
    });

    /**
     * Cuando persistMove lanza una excepción, el error debe registrarse en
     * consola y el juego debe continuar con normalidad (el bot sigue jugando).
     * El controlador llama console.error(err) sin prefijo adicional.
     */
    it("handles persist error gracefully when matchId exists", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
        });

        let movePersistCallCount = 0;

        fetchMock.mockImplementation(async (url) => {
            const urlString = String(url);

            if (urlString.includes("/ybot/")) {
                return new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }

            if (urlString.includes("/moves")) {
                movePersistCallCount++;
                if (movePersistCallCount === 1) {
                    throw new Error("Database connection failed");
                }
                return new Response(null, { status: 200 });
            }

            return new Response(null, { status: 404 });
        });

        const { result } = renderHook(() =>
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
    });

    it("bot plays without winning - normal game flow", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 6, y: 1, z: 0 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController(8));

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

    /**
     * En LOCAL_2P, el jugador 1 gana al conectar los tres lados.
     * El controlador no llama a window.alert; solo actualiza el estado interno.
     */
    it("detects LOCAL_2P winner with player 1 on size-1 board", async () => {
        const { result } = renderHook(() => useGameController(1));

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("¡Felicidades Jugador 1!");
        // El controlador no expone window.alert; la victoria se refleja solo en el estado.
    });

    it("uses expert difficulty when selected", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 0, y: 0, z: 0 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() =>
            useGameController(8, "BOT", undefined, undefined, "expert")
        );

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
        });

        const [url] = fetchMock.mock.calls[0];
        expect(String(url)).toContain("/v1/ybot/choose/expert");
    });

    it("online mode shows waiting message and skips bot fetch", async () => {
        const { result } = renderHook(() => useGameController(8, "ONLINE"));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.message).toBe("Esperando al servidor online...");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("handles malformed coords payload", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 1 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error).toBe("Respuesta inválida del bot.");
        });
    });

    it("handles unknown error status with text body", async () => {
        fetchMock.mockResolvedValueOnce(new Response("server exploded", { status: 500 }));

        const { result } = renderHook(() => useGameController());

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.error).toContain("Error del bot:");
        });
    });

    it("isBoardFull is false on empty board", () => {
        const { result } = renderHook(() => useGameController(4));
        expect(result.current.state.isBoardFull).toBe(false);
    });

    it("selectMode switches to LOCAL_2P and resets", () => {
        const { result } = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
        });

        expect(result.current.state.gameMode).toBe("LOCAL_2P");
        expect(result.current.state.gameOver).toBe(false);
    });

    it("persistFinish is called with USER when human wins with matchId", async () => {
        const initialYEN = {
            size: 3,
            turn: 0,
            players: ["B", "R"] as [string, string],
            layout: [".", "..", "BB."].join("/"),
        };

        fetchMock.mockImplementation(async () => {
            return new Response(JSON.stringify({ message: "ok" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        });

        const { result } = renderHook(() =>
            useGameController(3, "BOT", initialYEN, "match-finish-test")
        );

        await act(async () => {
            await result.current.actions.handleCellClick(2, 2);
        });

        await waitFor(() => {
            expect(result.current.state.gameOver).toBe(true);
        });

        const finishCall = fetchMock.mock.calls.find(([url]) =>
            String(url).includes("/matches/match-finish-test/finish")
        );

        expect(finishCall).toBeTruthy();
        expect(JSON.parse(finishCall![1]?.body as string)).toEqual({
            winner: "USER",
        });
    });

    it("persistFinish is called with BOT when bot wins with matchId", async () => {
        const initialYEN = {
            size: 3,
            turn: 0,
            players: ["B", "R"] as [string, string],
            layout: [".", "..", ".RR"].join("/"),
        };

        fetchMock.mockImplementation(async (url) => {
            const urlStr = String(url);

            if (urlStr.includes("/ybot/")) {
                return new Response(JSON.stringify({ coords: { x: 0, y: 0, z: 2 } }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }

            return new Response(JSON.stringify({ message: "ok" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        });

        const { result } = renderHook(() =>
            useGameController(3, "BOT", initialYEN, "match-bot-wins")
        );

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(result.current.state.gameOver).toBe(true);
        });

        const finishCall = fetchMock.mock.calls.find(([url]) =>
            String(url).includes("/matches/match-bot-wins/finish")
        );

        expect(finishCall).toBeTruthy();
        expect(JSON.parse(finishCall![1]?.body as string)).toEqual({
            winner: "BOT",
        });
    });
});