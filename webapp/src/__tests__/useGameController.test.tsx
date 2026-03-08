import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { useGameController } from "../features/game/hooks/useGameController";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("useGameController", () => {
    let fetchMock: ReturnType<typeof vi.fn<FetchFn>>;

    beforeEach(() => {
        vi.restoreAllMocks();

        fetchMock = vi.fn<FetchFn>();
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("alert", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
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

    it("detects LOCAL_2P winner", async () => {
        const { result } = renderHook(() => useGameController());

        act(() => {
            result.current.actions.selectMode("LOCAL_2P");
            result.current.actions.changeSize(1);
        });

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toBe("¡Felicidades Jugador 1!");
        expect(window.alert).toHaveBeenCalledWith("¡Felicidades Jugador 1!");
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
            expect(result.current.state.error).toBe("Respuesta inválida del bot.");
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
        (url as string).includes("/api/game/matches/match-123/moves")
      );

      expect(persistCall).toBeTruthy(); // Existe
      expect((persistCall![0] as string)).toContain(
        "/api/game/matches/match-123/moves"
      );
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
            expect(result.current.state.error)
                .toBe("No estás autenticado. Por favor inicia sesión.");
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
            expect(result.current.state.error)
                .toBe("Movimiento inválido enviado al servidor.");
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
            expect(result.current.state.error)
                .toBe("Juego ya ha terminado o conflicto de estado.");
        });
    });

    it("sets Authorization header when auth token exists", async () => {
        localStorage.setItem("jwt", "test-token");

        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 6, y: 0, z: 1 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController(undefined, "BOT", undefined, undefined, "test-token"));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        await waitFor(() => {
            expect(fetchMock.mock.calls[0][0]).toBe('/api/gamey/v1/ybot/choose/random');
            expect(fetchMock.mock.calls[0][1]?.headers)
                .toMatchObject({
                    Authorization: "Bearer test-token",
                });
        });
    });

    it("detects board full draw in BOT mode", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ coords: { x: 0, y: 0, z: 0 } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const { result } = renderHook(() => useGameController(1));

        await act(async () => {
            await result.current.actions.handleCellClick(0, 0);
        });

        expect(result.current.state.gameOver).toBe(true);
        expect(result.current.state.message).toContain("Felicidades");
    });
});