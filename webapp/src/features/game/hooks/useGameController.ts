import { useMemo, useState } from "react";
import type { YenPositionDto } from "../../../shared/contracts";
import {
    checkWinner,
    createEmptyYEN,
    getCellSymbol,
    rowColFromCoords,
    updateLayout,
} from "../domain/yen";
import { fetchWithAuth } from "../../../shared/api/fetchWithAuth";
import { API_CONFIG } from "../../../config/api.config";

export type GameMode = "BOT" | "LOCAL_2P" | "ONLINE";
export type BotDifficulty = "easy" | "medium" | "hard" | "expert";

const DEFAULT_BOARD_SIZE = 8;

export const useGameController = (
    initialSize: number = DEFAULT_BOARD_SIZE,
    initialMode: GameMode = "BOT",
    initialYEN?: YenPositionDto,
    initialMatchId?: string,
    botDifficulty: BotDifficulty = "easy"
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

    const persistMove = async (
        position: YenPositionDto,
        player: "USER" | "BOT"
    ) => {
        if (!matchId) return;

        try {
            await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/matches/${matchId}/moves`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    position_yen: position.layout,
                    player: player,
                    moveNumber: position.turn + 1,
                }),
            });

        } catch (err) {
            console.error("Persist error:", err);
        }
    };

    const handleCellClick = async (row: number, col: number) => {
        if (loading || gameOver) return;
        if (getCellSymbol(gameState.layout, row, col) !== ".") return;

        if (gameMode === "ONLINE") {
            setMessage("Esperando al servidor online...");
            return;
        }

        if (gameMode === "LOCAL_2P") {
            setGameState((prev) => {
                const nextSymbol = prev.turn === 0 ? prev.players[0] : prev.players[1];
                const newLayout = updateLayout(prev.layout, row, col, nextSymbol);
                const nextTurn = prev.turn === 0 ? 1 : 0;

                const nextState: YenPositionDto = {
                    ...prev,
                    layout: newLayout,
                    turn: nextTurn,
                };

                persistMove(nextState, nextSymbol === prev.players[0] ? "USER" : "BOT");

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

            persistMove(humanState, "USER");

            if (checkWinner(humanLayout, prev.size, prev.players[0])) {
                announceWinner("Jugador 1");
                persistMove(humanState, "USER");
                return humanState;
            }

            if (!humanLayout.includes(".")) {
                setGameOver(true);
                setMessage("Board full — game over");
                return humanState;
            }

            callBot(humanState);

            return humanState;
        });
    };

    const callBot = async (humanState: YenPositionDto) => {
        if (gameMode !== "BOT") return;

        setLoading(true);
        setError(null);
        setMessage("Bot pensando...");

        try {
            const res = await fetchWithAuth(`${API_CONFIG.GAME_ENGINE_API}/v1/ybot/choose/${botDifficulty}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(humanState),
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

            const data = await res.json();

            if (data.message) {
                setError(`Error del bot: ${data.message}`);
                setMessage("Error comunicando con el bot");
                setGameState({ ...humanState, turn: 0 });
                return;
            }

            const coords = data.coords;
            const hasValidCoords =
                coords &&
                typeof coords.x === "number" &&
                typeof coords.y === "number" &&
                typeof coords.z === "number";

            if (!hasValidCoords) {
                setError("Respuesta inválida del bot.");
                setMessage("Error comunicando con el bot");
                setGameState({ ...humanState, turn: 0 });
                return;
            }

            const mapped = rowColFromCoords(coords, humanState.size);

            if (!mapped || getCellSymbol(humanState.layout, mapped.row, mapped.col) !== ".") {
                setMessage("Bot sugirió una celda inválida, vuelve a jugar");
                setGameState({ ...humanState, turn: 0 });
                return;
            }

            const botLayout = updateLayout(humanState.layout, mapped.row, mapped.col, humanState.players[1]);
            const botState: YenPositionDto = { ...humanState, layout: botLayout, turn: 0 };

            setGameState(botState);
            await persistMove(botState, "BOT");

            if (checkWinner(botLayout, humanState.size, humanState.players[1])) {
                announceWinner("Jugador 2 (Bot)");
                await persistMove(botState, "BOT");
            } else if (!botLayout.includes(".")) {
                setGameOver(true);
                setMessage("Board full — game over");
                await persistMove(botState, "BOT");
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


    return {
        state: {
            gameMode,
            gameState,
            loading,
            error,
            message,
            gameOver,
            isBoardFull
        },
        actions: {
            selectMode: resetGame,
            newGame: () => resetGame(gameMode),
            handleCellClick,
            changeSize,
        },
    };
};
