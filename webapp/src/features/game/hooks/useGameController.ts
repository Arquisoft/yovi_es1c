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

const BOARD_SIZE = 8;

const GAMEY_URL =
    import.meta.env.VITE_GAMEY_API_URL ?? "http://localhost:4000";

export const useGameController = () => {
    const [gameMode, setGameMode] = useState<GameMode>("BOT");
    const [gameState, setGameState] = useState<YenPositionDto>(() =>
        createEmptyYEN(BOARD_SIZE)
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string>("Click a cell to play");
    const [gameOver, setGameOver] = useState(false);

    const isBoardFull = useMemo(() => {
        return !gameState.layout.includes(".");
    }, [gameState.layout]);

    const announceWinner = (label: string) => {
        setGameOver(true);
        setMessage(`¡Felicidades ${label}!`);
        window.alert(`¡Felicidades ${label}!`);
    };

    const resetGame = (nextMode: GameMode) => {
        setGameMode(nextMode);
        setGameState(createEmptyYEN(BOARD_SIZE));
        setLoading(false);
        setError(null);
        setGameOver(false);
        setMessage("Click a cell to play");
    };

    const changeSize = (newSize: number) => {
        // Crear nuevo layout vacío con el tamaño especificado
        const emptyLayout = Array(newSize)
            .fill(null)
            .map((_, i) => '.'.repeat(i + 1))
            .join('/');

        setGameState({
            ...gameState,
            size: newSize,
            layout: emptyLayout,
            turn: 0,
        });
        setMessage('');
        setGameOver(false);
        setError(null);
    };

    const handleCellClick = async (row: number, col: number) => {
        if (loading || gameOver) return;
        if (gameMode === "BOT" && gameState.turn !== 0) return;
        if (getCellSymbol(gameState.layout, row, col) !== ".") return;

        if (gameMode === "LOCAL_2P") {
            setGameState((prevState) => {
                const nextSymbol =
                    prevState.turn === 0 ? prevState.players[0] : prevState.players[1];

                const nextLayout = updateLayout(prevState.layout, row, col, nextSymbol);

                const nextState: YenPositionDto = {
                    ...prevState,
                    layout: nextLayout,
                    turn: prevState.turn === 0 ? 1 : 0,
                };

                if (checkWinner(nextLayout, prevState.size, nextSymbol)) {
                    announceWinner(
                        nextSymbol === prevState.players[0] ? "Jugador 1" : "Jugador 2"
                    );
                } else if (!nextLayout.includes(".")) {
                    setGameOver(true);
                    setMessage("Board full — game over");
                } else {
                    setMessage(
                        `Turn: ${
                            nextState.turn === 0 ? "Player 1 (Blue)" : "Player 2 (Red)"
                        }`
                    );
                }

                return nextState;
            });
            return;
        }

        setGameState((prevState) => {
            const humanLayout = updateLayout(
                prevState.layout,
                row,
                col,
                prevState.players[0]
            );

            const humanState: YenPositionDto = {
                ...prevState,
                layout: humanLayout,
                turn: 1,
            };

            if (checkWinner(humanLayout, prevState.size, prevState.players[0])) {
                announceWinner("Jugador 1");
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
        setMessage("Bot is thinking...");

        try {
            const res = await fetch(`${GAMEY_URL}/v1/ybot/choose/random_bot`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(humanState),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Bot error: ${errorText}`);
            }

            const data: ChooseMoveResponseDto = await res.json();
            console.log("Bot response:", data);

            const mapped = rowColFromCoords(data.coords, humanState.size);

            if (mapped) {
                if (getCellSymbol(humanState.layout, mapped.row, mapped.col) !== ".") {
                    setMessage(`Bot suggested an occupied cell (${mapped.row}, ${mapped.col})`);
                    setGameState({ ...humanState, turn: 0 });
                    return;
                }

                const botLayout = updateLayout(
                    humanState.layout,
                    mapped.row,
                    mapped.col,
                    humanState.players[1]
                );

                const botState: YenPositionDto = {
                    ...humanState,
                    layout: botLayout,
                    turn: 0,
                };

                setGameState(botState);

                if (checkWinner(botLayout, humanState.size, humanState.players[1])) {
                    announceWinner("Jugador 2 (Bot)");
                } else if (!botLayout.includes(".")) {
                    setGameOver(true);
                    setMessage("Board full — game over");
                } else {
                    setMessage(`Bot played at (${mapped.row}, ${mapped.col}) — your turn again`);
                }
            } else {
                setMessage(
                    `Bot suggested coords (${data.coords.x}, ${data.coords.y}, ${data.coords.z})`
                );
                setGameState({ ...humanState, turn: 0 });
            }
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "Error");
            setMessage("Error talking to bot");
        } finally {
            setLoading(false);
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
