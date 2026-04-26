import type { TFunction } from "i18next";

export type Player = { username?: string | null };
export type GameMode = 'BOT' | 'LOCAL_2P' | 'ONLINE';
export type WinnerSymbol = 'B' | 'R' | string | null | undefined;

function tWithDefault(t: TFunction, key: string, fallback: string): string {
    const translated = t(key, { defaultValue: fallback });
    return !translated || translated === key ? fallback : String(translated);
}

function resolveBotName(t: TFunction): string {
    return tWithDefault(t, 'botName', 'Bot');
}

function fallbackPlayerName(
    index: 0 | 1,
    mode: GameMode,
    t: TFunction,
    humanPlayerName?: string | null,
): string {
    if (index === 0) {
        return humanPlayerName?.trim() || t('player1');
    }

    if (mode === 'BOT') {
        return resolveBotName(t);
    }

    return t('player2');
}

export function resolvePlayerName(
    players: Player[] | undefined,
    index: 0 | 1,
    mode: GameMode,
    t: TFunction,
    humanPlayerName?: string | null,
): string {
    const configuredName = players?.[index]?.username?.trim();
    return configuredName || fallbackPlayerName(index, mode, t, humanPlayerName);
}

export function resolveCurrentTurnLabel(
    isOnline: boolean,
    turn: number,
    players: Player[],
    mode: GameMode,
    t: TFunction,
    humanPlayerName?: string | null,
): string {
    if (isOnline) {
        return turn === 0
            ? resolvePlayerName(players, 0, 'ONLINE', t)
            : resolvePlayerName(players, 1, 'ONLINE', t);
    }

    if (mode === 'BOT') {
        return turn === 0
            ? humanPlayerName?.trim() || t('player1')
            : resolveBotName(t);
    }

    return turn === 0 ? t('player1') : t('player2');
}

export function resolveWinnerLabel(
    winner: WinnerSymbol,
    players: Player[],
    t: TFunction,
    mode: GameMode = 'ONLINE',
    humanPlayerName?: string | null,
): string | null {
    if (winner === 'B') return resolvePlayerName(players, 0, mode, t, humanPlayerName);
    if (winner === 'R') return resolvePlayerName(players, 1, mode, t, humanPlayerName);
    return null;
}

export function resolveLoserLabel(
    winner: WinnerSymbol,
    players: Player[],
    t: TFunction,
    mode: GameMode = 'ONLINE',
    humanPlayerName?: string | null,
): string | null {
    if (winner === 'B') return resolvePlayerName(players, 1, mode, t, humanPlayerName);
    if (winner === 'R') return resolvePlayerName(players, 0, mode, t, humanPlayerName);
    return null;
}

export function resolveWinnerMessage(
    winner: WinnerSymbol,
    players: Player[],
    mode: GameMode,
    t: TFunction,
    humanPlayerName?: string | null,
): string {
    const winnerName = resolveWinnerLabel(winner, players, t, mode, humanPlayerName);
    if (!winnerName) return t('gameOver');

    if (mode === 'ONLINE') {
        const loserName = resolveLoserLabel(winner, players, t, mode, humanPlayerName);

        return loserName
            ? t('winnerOnline', { winner: winnerName, loser: loserName })
            : t('winnerAnnouncement', { label: winnerName });
    }

    if (mode === 'BOT') {
        return winner === 'B'
            ? t('winnerBotUser', {
                winner: winnerName,
                bot: resolveBotName(t),
            })
            : t('winnerBotBot', {
                bot: winnerName,
                player: resolvePlayerName(players, 0, mode, t, humanPlayerName),
            });
    }

    if (mode === 'LOCAL_2P') {
        const localWinnerName = winner === 'B' ? t('player1') : t('player2');
        return t('winnerAnnouncement', { label: localWinnerName });
    }

    return t('winnerAnnouncement', { label: winnerName });
}

export function resolveGameOverText(
    winnerLabel: string | null,
    t: TFunction,
): string {
    if (!winnerLabel) return t('gameOver');

    return t('winnerMessage', {
        name: winnerLabel,
    });
}