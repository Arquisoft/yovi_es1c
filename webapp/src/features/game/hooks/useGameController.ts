import { useMemo, useState } from "react";
import type { YenPositionDto } from "../../../shared/contracts";
import { checkWinner, updateLayout, getCellSymbol, createEmptyYEN } from "../domain/yen";

export type GameMode = "BOT" | "LOCAL_2P";

export const useGameController = (
    initialSize: number = 8,
    initialMode: GameMode = "BOT",
    initialYEN?: YenPositionDto
) => {
    const boardSize = initialSize;
    const [gameMode, setGameMode] = useState<GameMode>(initialMode);
    const [gameState, setGameState] = useState<YenPositionDto>(() => initialYEN ?? createEmptyYEN(boardSize));

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [gameOver, setGameOver] = useState(false);

    const isBoardFull = useMemo(() => !gameState.layout.includes("."), [gameState.layout]);

    const announceWinner = (label: string) => {
        setGameOver(true);
        window.alert(`¡Felicidades ${label}!`);
    };

    const resetGame = (nextMode: GameMode) => {
        setGameMode(nextMode);
        setGameState(createEmptyYEN(boardSize));
        setLoading(false);
        setError(null);
        setGameOver(false);
    };

    const handleCellClick = (row: number, col: number) => {
        if (loading || gameOver) return;
        if (gameMode === "BOT" && gameState.turn !== 0) return;
        if (getCellSymbol(gameState.layout, row, col) !== ".") return;

        setGameState(prev => {
            const nextSymbol = prev.turn === 0 ? prev.players[0] : prev.players[1];
            const newLayout = updateLayout(prev.layout, row, col, nextSymbol);
            const nextState = { ...prev, layout: newLayout, turn: prev.turn === 0 ? 1 : 0 };

            if (checkWinner(newLayout, prev.size, nextSymbol)) {
                announceWinner(nextSymbol === prev.players[0] ? "Jugador 1" : "Jugador 2");
            }

            return nextState;
        });
    };

    // ← Aquí al final del hook retornas el estado y las acciones
    return {
        state: { gameMode, gameState, loading, error, gameOver, isBoardFull },
        actions: {
            newGame: () => resetGame(gameMode), // ahora puedes usar actions.newGame
            handleCellClick,
        },
    };
};