export type Player = { username: string };
export type GameMode = 'BOT' | 'LOCAL_2P' | 'ONLINE';

export function resolveCurrentTurnLabel(
    isOnline: boolean,
    turn: number,
    players: Player[],
    mode: GameMode,
): string {
    if (isOnline) {
        return turn === 0
            ? (players[0]?.username ?? 'Jugador 1')
            : (players[1]?.username ?? 'Jugador 2');
    }
    if (turn !== 0) {
        return mode === 'BOT' ? 'Bot' : 'Jugador 2';
    }
    return 'Jugador 1';
}

export function resolveWinnerLabel(
    winner: string | null,
    players: Player[],
): string | null {
    if (winner === 'B') return players[0]?.username ?? 'Jugador 1';
    if (winner === 'R') return players[1]?.username ?? 'Jugador 2';
    if (winner === 'DRAW') return 'Empate';
    return null;
}

export function resolveGameOverText(winnerLabel: string | null): string {
    if (!winnerLabel) return '¡Partida terminada!';
    if (winnerLabel === 'Empate') return '¡Partida terminada en empate!';
    return `¡Ganador: ${winnerLabel}!`;
}