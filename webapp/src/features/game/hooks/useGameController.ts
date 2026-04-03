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
const GAMEY_TIMEOUT_MS = 4000;

// ── Helpers externos al hook (reducen complejidad cognitiva de callBot) ──

function buildBotHttpError(status: number, textFn: () => Promise<string>): Promise<string> {
    if (status === 401) return Promise.resolve("No estás autenticado. Por favor inicia sesión.");
    if (status === 400) return Promise.resolve("Movimiento inválido enviado al servidor.");
    if (status === 409) return Promise.resolve("Juego ya ha terminado o conflicto de estado.");
    return textFn().then((t) => `Error del bot: ${t}`);
}

function revertBotState(
    humanState: YenPositionDto,
    errorMsg: string,
    setError: (e: string) => void,
    setMessage: (m: string) => void,
    setGameState: (s: YenPositionDto) => void,
    setBotFailureCount: (fn: (n: number) => number) => void
): void {
    setError(errorMsg);
    setMessage("Error comunicando con el bot");
    setGameState({ ...humanState, turn: 0 });
    setBotFailureCount((prev) => prev + 1);
}

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
    const [botFailureCount, setBotFailureCount] = useState(0);

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

    const finishMatch = async (winner: "USER" | "BOT" | "DRAW") => {
        if (!matchId) return;
        try {
            await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/matches/${matchId}/finish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ winner }),
            });
        } catch (err) {
            console.error("Finish match error:", err);
        }
    };

    const persistMove = async (
        position: YenPositionDto,
        player: "USER" | "BOT"
    ) => {
        if (!matchId) return;
        try {
            await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/matches/${matchId}/moves`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
                const nextState: YenPositionDto = { ...prev, layout: newLayout, turn: nextTurn };
                persistMove(nextState, nextSymbol === prev.players[0] ? "USER" : "BOT");
                if (checkWinner(newLayout, prev.size, nextSymbol)) {
                    const winnerCode = nextSymbol === prev.players[0] ? "USER" : "BOT";
                    announceWinner(nextSymbol === prev.players[0] ? "Jugador 1" : "Jugador 2");
                    finishMatch(winnerCode);
                } else if (!newLayout.includes(".")) {
                    setGameOver(true);
                    setMessage("Board full — game over");
                    finishMatch("DRAW");
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
                finishMatch("USER");
                return humanState;
            }
            if (!humanLayout.includes(".")) {
                setGameOver(true);
                setMessage("Board full — game over");
                finishMatch("DRAW");
                return humanState;
            }
            callBot(humanState);
            return humanState;
        });
    };

    // ── applyBotMove extraída para bajar complejidad de callBot ──
    const applyBotMove = async (
        humanState: YenPositionDto,
        data: { coords: { x: number; y: number; z: number } },
        usedDifficulty: BotDifficulty
    ) => {
        const mapped = rowColFromCoords(data.coords, humanState.size);
        if (!mapped || getCellSymbol(humanState.layout, mapped.row, mapped.col) !== ".") {
            setMessage("Bot sugirió una celda inválida, vuelve a jugar");
            setGameState({ ...humanState, turn: 0 });
            setBotFailureCount((prev) => prev + 1);
            return;
        }
        const botLayout = updateLayout(humanState.layout, mapped.row, mapped.col, humanState.players[1]);
        const botState: YenPositionDto = { ...humanState, layout: botLayout, turn: 0 };
        setGameState(botState);
        await persistMove(botState, "BOT");
        if (checkWinner(botLayout, humanState.size, humanState.players[1])) {
            announceWinner("Jugador 2 (Bot)");
            await finishMatch("BOT");
        } else if (!botLayout.includes(".")) {
            setGameOver(true);
            setMessage("Board full — game over");
            await finishMatch("DRAW");
        } else {
            const fallbackInfo = usedDifficulty !== botDifficulty ? ` [fallback: ${usedDifficulty}]` : '';
            setMessage(`Bot jugó en (${mapped.row}, ${mapped.col}) — tu turno${fallbackInfo}`);
        }
        setBotFailureCount(0);
    };

    const callBot = async (humanState: YenPositionDto) => {
        if (gameMode !== "BOT") return;
        setLoading(true);
        setError(null);
        setMessage("Bot pensando...");
        try {
            const { response: res, usedDifficulty } = await requestBotMove(humanState, botDifficulty, botFailureCount);
            if (!res.ok) {
                const errorMsg = await buildBotHttpError(res.status, () => res.text());
                revertBotState(humanState, errorMsg, setError, setMessage, setGameState, setBotFailureCount);
                return;
            }
            const data = await res.json();
            if (data.message) {
                revertBotState(humanState, `Error del bot: ${data.message}`, setError, setMessage, setGameState, setBotFailureCount);
                return;
            }
            const coords = data.coords;
            const hasValidCoords =
                coords &&
                typeof coords.x === "number" &&
                typeof coords.y === "number" &&
                typeof coords.z === "number";
            if (!hasValidCoords) {
                revertBotState(humanState, "Respuesta inválida del bot.", setError, setMessage, setGameState, setBotFailureCount);
                return;
            }
            await applyBotMove(humanState, data, usedDifficulty);
        } catch (err) {
            revertBotState(
                humanState,
                err instanceof Error ? err.message : "Error desconocido",
                setError, setMessage, setGameState, setBotFailureCount
            );
        } finally {
            setLoading(false);
        }
    };

    const requestBotMove = async (
        state: YenPositionDto,
        difficulty: BotDifficulty,
        failureCount: number
    ): Promise<{ response: Response; usedDifficulty: BotDifficulty }> => {
        const hasExpertDegraded = difficulty === 'expert' && failureCount >= 3;
        const primaryDifficulty: BotDifficulty = hasExpertDegraded ? 'hard' : difficulty;
        const candidates: BotDifficulty[] = primaryDifficulty === 'expert' ? ['expert', 'hard'] : [primaryDifficulty];
        let lastError: unknown = null;
        for (const level of candidates) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), GAMEY_TIMEOUT_MS);
            try {
                const response = await fetchWithAuth(`${API_CONFIG.GAME_ENGINE_API}/v1/ybot/choose/${level}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(state),
                    signal: controller.signal,
                });
                if (!response.ok && level === 'expert' && (response.status >= 500 || response.status === 504)) {
                    continue;
                }
                return { response, usedDifficulty: level };
            } catch (error) {
                lastError = error;
                if (error instanceof Error && error.name === 'AbortError' && level !== 'expert') {
                    throw new Error('Timeout comunicando con gamey');
                }
                if (level !== 'expert') throw error;
            } finally {
                clearTimeout(timeout);
            }
        }
        if (lastError instanceof Error && lastError.name === 'AbortError') {
            throw new Error('Timeout comunicando con gamey');
        }
        throw lastError instanceof Error ? lastError : new Error('No se pudo obtener respuesta del bot');
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