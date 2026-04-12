import type { TFunction } from "i18next";

export type Player = { username: string };
export type GameMode = 'BOT' | 'LOCAL_2P' | 'ONLINE';

export function resolveCurrentTurnLabel(
    isOnline: boolean,
    turn: number,
    players: Player[],
    mode: GameMode,
    t: TFunction,
): string {
    if (isOnline) {
        return turn === 0
            ? (players[0]?.username ?? t('player1'))
            : (players[1]?.username ?? t('player2'));
    }
    if (turn !== 0) {
        return mode === 'BOT' ? t('Bot') : t('player2');
    }
    return t('player1');
}

export function resolveWinnerLabel(
    winner: string | null,
    players: Player[],
    t: TFunction,
): string | null {
    if (winner === 'B') return players[0]?.username ?? t('player1');
    if (winner === 'R') return players[1]?.username ?? t('player2');
    return null;
}

export function resolveGameOverText(winnerLabel: string | null, t: TFunction): string {
    if (!winnerLabel) return t('gameOver');
    return t('winner') + ` ${winnerLabel}!`;
}