import { useMemo, useState } from "react";
import type { ChooseMoveResponseDto, YenPositionDto } from "../../../shared/contracts";
import {
    checkWinner,
    createEmptyYEN,
    getCellSymbol,
    rowColFromCoords,
    updateLayout,
} from "../domain/yen";

export type GameMode = "BOT" | "LOCAL_2P";

const DEFAULT_BOARD_SIZE = 8;
const GAMEY_URL = import.meta.env.VITE_GAMEY_API_URL ?? "http://localhost:4000";
const GAME_API_URL = import.meta.env.VITE_GAME_API_URL ?? "http://localhost:3000";

export const useGameController = (
    initialSize: number = DEFAULT_BOARD_SIZE,
    initialMode: GameMode = "BOT",
    initialYEN?: YenPositionDto,
    initialMatchId?: string
) => {
    const [gameMode, setGameMode] = useState<GameMode>(initialMode);
    const [gameState, setGameState] = useState<YenPositionDto>(
        () => initialYEN ?? createEmptyYEN(initialSize)
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string>("Click a cell to play");
    const [gameOver, setGameOver] = useState(false);

    const [matchId] = useState<string | null>(initialMatchId ?? null);

    const isBoardFull = useMemo(() => !gameState.layout.includes("."), [gameState.layout]);

    const announceWinner = (label: string) => {
        setGameOver(true);
        setMessage(`¡Felicidades ${label}!`);
        window.alert(`¡Felicidades ${label}!`);
    };

    const resetGame = (nextMode: GameMode) => {
        setGameMode(nextMode);
        setGameState(createEmptyYEN(initialSize));
        setLoading(false);
        setError(null);
        setGameOver(false);
        setMessage("Click a cell to play");
    };

    const changeSize = (newSize: number) => {
        const emptyLayout = Array.from({ length: newSize }, (_, i) => ".".repeat(i + 1)).join("/");
        setGameState({
            ...gameState,
            size: newSize,
            layout: emptyLayout,
            turn: 0,
        });
        setGameOver(false);
        setError(null);
        setMessage("Click a cell to play");
    };

    const handleCellClick = async (row: number, col: number, strategy?: string, difficulty?: string) => {
        if (loading || gameOver) return;
        if (getCellSymbol(gameState.layout, row, col) !== ".") return;

        if (gameMode === "LOCAL_2P") {
            // Turnos alternos entre jugador 1 y jugador 2
            setGameState((prev) => {
                const nextSymbol = prev.turn === 0 ? prev.players[0] : prev.players[1];
                const newLayout = updateLayout(prev.layout, row, col, nextSymbol);
                const nextTurn = prev.turn === 0 ? 1 : 0;

                const nextState: YenPositionDto = {
                    ...prev,
                    layout: newLayout,
                    turn: nextTurn,
                };

                persistMove(nextState, "ongoing");

                if (checkWinner(newLayout, prev.size, nextSymbol)) {
                    announceWinner(nextSymbol === prev.players[0] ? "Jugador 1" : "Jugador 2");
                } else if (!newLayout.includes(".")) {
                    setGameOver(true);
                    setMessage("Board full — game over");
                } else {
                    setMessage(`Turno: ${nextTurn === 0 ? "Jugador 1 (Blue)" : "Jugador 2 (Red)"}`);
                }

                return nextState;
            });
            return;
        }

        setGameState((prev) => {
            const humanLayout = updateLayout(prev.layout, row, col, prev.players[0]);
            const humanState: YenPositionDto = { ...prev, layout: humanLayout, turn: 1 };

            persistMove(humanState, "ongoing");

            if (checkWinner(humanLayout, prev.size, prev.players[0])) {
                announceWinner("Jugador 1");
                persistMove(humanState, "win");
                return humanState;
            }

            if (!humanLayout.includes(".")) {
                setGameOver(true);
                setMessage("Board full — game over");
                return humanState;
            }

            callBot(humanState, strategy, difficulty);

            return humanState;
        });
    };

    const callBot = async (humanState: YenPositionDto, strategy?: string, difficulty?: string) => {
        if (gameMode !== "BOT") return;

        setLoading(true);
        setError(null);
        setMessage("Bot pensando...");

        try {
            const token = localStorage.getItem("jwt");

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const res = await fetch(`${GAMEY_URL}/api/gamey/play`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    position: humanState.layout,
                    strategy: strategy ?? "random",
                    difficulty: difficulty ?? "normal",
                }),
            });

            if (!res.ok) {
                if (res.status === 401) setError("No estás autenticado. Por favor inicia sesión.");
                else if (res.status === 400) setError("Movimiento inválido enviado al servidor.");
                else if (res.status === 409) setError("Juego ya ha terminado o conflicto de estado.");
                else setError(`Error del bot: ${await res.text()}`);

                setMessage("Error comunicando con el bot");
                setGameState({ ...humanState, turn: 0 });
                return;
            }

            const data: ChooseMoveResponseDto = await res.json();
            const mapped = rowColFromCoords(data.coords, humanState.size);

            if (!mapped || getCellSymbol(humanState.layout, mapped.row, mapped.col) !== ".") {
                setMessage("Bot sugirió una celda inválida, vuelve a jugar");
                setGameState({ ...humanState, turn: 0 });
                return;
            }

            const botLayout = updateLayout(humanState.layout, mapped.row, mapped.col, humanState.players[1]);
            const botState: YenPositionDto = { ...humanState, layout: botLayout, turn: 0 };

            setGameState(botState);
            await persistMove(botState, "ongoing");

            if (checkWinner(botLayout, humanState.size, humanState.players[1])) {
                announceWinner("Jugador 2 (Bot)");
                await persistMove(botState, "lose");
            } else if (!botLayout.includes(".")) {
                setGameOver(true);
                setMessage("Board full — game over");
                await persistMove(botState, "draw");
            } else {
                setMessage(`Bot jugó en (${mapped.row}, ${mapped.col}) — tu turno`);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : "Error desconocido");
            setMessage("Error comunicando con el bot");
            setGameState({ ...humanState, turn: 0 });
        } finally {
            setLoading(false);
        }
    };

    const persistMove = async (
        position: YenPositionDto,
        status: "ongoing" | "win" | "lose" | "draw"
    ) => {

        if (!matchId) return;

        try {

            const token = localStorage.getItem("jwt");

            await fetch(`${GAME_API_URL}/api/game/matches/${matchId}/moves`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    position,
                    status,
                }),
            });

        } catch (err) {
            console.error("Persist error:", err);
        }
    };

    return {
        state: { gameMode, gameState, loading, error, message, gameOver, isBoardFull },
        actions: {
            selectMode: resetGame,
            newGame: () => resetGame(gameMode),
            handleCellClick,
            changeSize,
        },
    };
};