import { useMemo, useState } from "react";
import type { YenPositionDto } from "../../../shared/contracts";
import type { MatchRulesDto } from "../../../shared/contracts";
import { fetchWithAuth } from "../../../shared/api/fetchWithAuth";
import { API_CONFIG } from "../../../config/api.config";

// ── Tipos ──
export type GameMode = "BOT" | "LOCAL_2P" | "ONLINE";
export type BotDifficulty = "easy" | "medium" | "hard" | "expert";

const DEFAULT_BOARD_SIZE = 8;
const GAMEY_TIMEOUT_MS = 4000;
const CLASSIC_RULES: MatchRulesDto = {
    pieRule: { enabled: false },
    honey: { enabled: false, blockedCells: [] },
};

const normalizeRules = (rules?: MatchRulesDto): MatchRulesDto => ({
    pieRule: { enabled: rules?.pieRule?.enabled === true },
    honey: {
        enabled: rules?.honey?.enabled === true,
        blockedCells: rules?.honey?.enabled ? [...(rules?.honey?.blockedCells ?? [])] : [],
    },
});

const isBlockedCell = (rules: MatchRulesDto, row: number, col: number) =>
    rules.honey.enabled && rules.honey.blockedCells.some((cell) => cell.row === row && cell.col === col);

// ── Funciones de dominio ──
export const createEmptyYEN = (size: number, rules: MatchRulesDto = CLASSIC_RULES): YenPositionDto => {
    const layout = Array.from({ length: size }, (_, rowIndex) =>
        ".".repeat(rowIndex + 1)
    ).join("/");
    return { size, turn: 0, players: ["B", "R"], layout, rules: normalizeRules(rules) };
};

export const updateLayout = (
    layout: string,
    row: number,
    col: number,
    symbol: string
): string => {
    const rows = layout.split("/");
    const rowChars = rows[row].split("");
    rowChars[col] = symbol;
    rows[row] = rowChars.join("");
    return rows.join("/");
};

export const getCellSymbol = (layout: string, row: number, col: number): string =>
    layout.split("/")[row]?.[col] ?? ".";

export const coordsFromRowCol = (row: number, col: number, size: number) => {
    const x = size - 1 - row;
    const y = col;
    const z = row - col;
    return { x, y, z };
};

export const rowColFromCoords = (
    coords: { x: number; y: number; z: number },
    size: number
) => {
    const row = size - 1 - coords.x;
    const col = coords.y;
    if (row < 0 || row >= size) return null;
    if (col < 0 || col > row) return null;
    if (row - col !== coords.z) return null;
    return { row, col };
};

// ── Check ganador corregido ──
export const checkWinner = (layout: string, size: number, symbol: string): boolean => {
    const visited = new Set<string>();
    const rows = layout.split("/");

    const hasSymbol = (row: number, col: number) => rows[row]?.[col] === symbol;

    for (let row = 0; row < size; row++) {
        for (let col = 0; col <= row; col++) {
            if (!hasSymbol(row, col)) continue;
            const key = `${row}-${col}`;
            if (visited.has(key)) continue;

            const queue: Array<{ row: number; col: number }> = [{ row, col }];
            visited.add(key);

            let touchesX = false;
            let touchesY = false;
            let touchesZ = false;

            while (queue.length > 0) {
                const current = queue.shift()!;
                const coords = coordsFromRowCol(current.row, current.col, size);

                if (coords.x === 0) touchesX = true;
                if (coords.y === 0) touchesY = true;
                if (coords.z === 0) touchesZ = true;

                if (touchesX && touchesY && touchesZ) return true;

                const neighbors = [
                    { x: coords.x - 1, y: coords.y + 1, z: coords.z },
                    { x: coords.x - 1, y: coords.y, z: coords.z + 1 },
                    { x: coords.x + 1, y: coords.y - 1, z: coords.z },
                    { x: coords.x, y: coords.y - 1, z: coords.z + 1 },
                    { x: coords.x + 1, y: coords.y, z: coords.z - 1 },
                    { x: coords.x, y: coords.y + 1, z: coords.z - 1 },
                ];

                for (const n of neighbors) {
                    if (n.x < 0 || n.y < 0 || n.z < 0) continue;
                    if (n.x + n.y + n.z !== size - 1) continue;
                    const next = rowColFromCoords(n, size);
                    if (!next) continue;
                    const nextKey = `${next.row}-${next.col}`;
                    if (visited.has(nextKey)) continue;
                    if (!hasSymbol(next.row, next.col)) continue;
                    visited.add(nextKey);
                    queue.push(next);
                }
            }
        }
    }
    return false;
};

// ── Helpers externos ──
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

// ── Hook principal ──
export const useGameController = (
    initialSize: number = DEFAULT_BOARD_SIZE,
    initialMode: GameMode = "BOT",
    initialYEN?: YenPositionDto,
    initialMatchId?: string,
    botDifficulty: BotDifficulty = "easy",
    initialRules: MatchRulesDto = CLASSIC_RULES,
) => {
    const resolvedInitialRules = normalizeRules(initialYEN?.rules ?? initialRules);
    const [gameMode, setGameMode] = useState<GameMode>(initialMode);
    const [gameState, setGameState] = useState<YenPositionDto>(
        () => initialYEN ? { ...initialYEN, rules: normalizeRules(initialYEN.rules ?? initialRules) } : createEmptyYEN(initialSize, resolvedInitialRules)
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
    };

    const resetGame = (nextMode: GameMode) => {
        setGameMode(nextMode);
        setGameState(createEmptyYEN(initialSize, resolvedInitialRules));
        setLoading(false);
        setError(null);
        setGameOver(false);
        setMessage("Click a cell to play");
    };

    const changeSize = (newSize: number) => {
        const emptyLayout = Array.from({ length: newSize }, (_, i) => ".".repeat(i + 1)).join("/");
        setGameState({ ...gameState, size: newSize, layout: emptyLayout, turn: 0, rules: normalizeRules(gameState.rules ?? resolvedInitialRules) });
        setGameOver(false);
        setError(null);
        setMessage("Click a cell to play");
    };

    const finishMatch = async (winner: "USER" | "BOT") => {
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
                body: JSON.stringify({ position_yen: position.layout, player, moveNumber: position.turn + 1 }),
            });
        } catch (err) {
            console.error("Persist error:", err);
        }
    };

    const persistFinish = async (winner: "USER" | "BOT") => {
        if (!matchId) return;
        try {
            await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/matches/${matchId}/finish`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ winner }),
            });
        } catch (err) {
            console.error("Finish error:", err);
        }
    };

    // ── Manejo de clics ──
    const handleCellClick = async (row: number, col: number) => {
        if (loading || gameOver) return;
        if (isBlockedCell(normalizeRules(gameState.rules ?? resolvedInitialRules), row, col)) return;
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
                persistFinish("USER");
                return humanState;
            }

            callBot(humanState);
            return humanState;
        });
    };

    // ── Bot ──
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
            await persistFinish("BOT");
        } else {
            const fallbackInfo = usedDifficulty !== botDifficulty ? ` [fallback: ${usedDifficulty}]` : "";
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
                setError,
                setMessage,
                setGameState,
                setBotFailureCount
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
        const hasExpertDegraded = difficulty === "expert" && failureCount >= 3;
        const primaryDifficulty: BotDifficulty = hasExpertDegraded ? "hard" : difficulty;
        const candidates: BotDifficulty[] = primaryDifficulty === "expert" ? ["expert", "hard"] : [primaryDifficulty];

        let lastError: unknown = null;

        for (const level of candidates) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), GAMEY_TIMEOUT_MS);

            try {
                const response = await fetchWithAuth(`${API_CONFIG.GAME_ENGINE_API}/v1/ybot/choose/${level}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...state,
                        rules: normalizeRules(state.rules ?? resolvedInitialRules),
                    }),
                    signal: controller.signal,
                });

                if (!response.ok && level === "expert" && (response.status >= 500 || response.status === 504)) {
                    continue;
                }

                return { response, usedDifficulty: level };
            } catch (error) {
                lastError = error;

                if (error instanceof Error && error.name === "AbortError" && level !== "expert") {
                    throw new Error("Timeout comunicando con gamey");
                }

                if (level !== "expert") throw error;
            } finally {
                clearTimeout(timeout);
            }
        }

        if (lastError instanceof Error && lastError.name === "AbortError") {
            throw new Error("Timeout comunicando con gamey");
        }

        throw lastError instanceof Error ? lastError : new Error("No se pudo obtener respuesta del bot");
    };

    return {
        state: { gameMode, gameState, loading, error, message, gameOver, isBoardFull },
        actions: {
            selectMode: resetGame,
            newGame: () => resetGame(gameMode),
            handleCellClick,
            changeSize,
            applyPieSwap: () => {
                setGameState((prev) => {
                    const rules = normalizeRules(prev.rules ?? resolvedInitialRules);
                    const stoneCount = prev.layout.split('/').join('').split('').filter((c) => c === 'B' || c === 'R').length;
                    if (gameMode !== "LOCAL_2P" || !rules.pieRule.enabled || prev.turn !== 1 || stoneCount !== 1) {
                        return prev;
                    }
                    const swappedLayout = prev.layout
                        .split('')
                        .map((ch) => (ch === 'B' ? 'R' : ch === 'R' ? 'B' : ch))
                        .join('');
                    setMessage("Pie Rule aplicado: se intercambiaron colores");
                    return { ...prev, layout: swappedLayout, turn: 0, rules };
                });
            },
        },
    };
};