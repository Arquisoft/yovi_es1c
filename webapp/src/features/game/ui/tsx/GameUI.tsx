import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Paper,
    Stack,
    Typography,
} from '@mui/material';

import { Board } from './Board.tsx';
import { useAuth } from '../../../auth';
import { useGameController, type BotDifficulty } from '../../hooks/useGameController.ts';
import {
    useOnlineSession,
    type RematchCallbacks,
    type RematchRequestedPayload,
    type RematchReadyPayload,
    type RematchDeclinedPayload,
} from '../../hooks/useOnlineSession';
import { useChatSession } from '../../hooks/useChatSession';
import type { MatchRulesDto, YenPositionDto } from '../../../../shared/contracts';
import styles from '../css/GameUI.module.css';
import ConnectionBadge from './ConnectionBadge';
import TurnTimer from './TurnTimer';
import ChatBox from './ChatBox';
import { resolveCurrentTurnLabel, resolveWinnerLabel } from './gameUIHelpers.ts';
import WinnerOverlay, { type RematchState } from './WinnerOverlay';
import { useTranslation } from 'react-i18next';
import type { GameMessage } from '../../hooks/useGameController';
import { HelpButton } from '../../../../components/HelpButton';

type GameConfig = {
    matchId: string;
    boardSize: number;
    difficulty: BotDifficulty;
    mode: 'BOT' | 'LOCAL_2P' | 'ONLINE';
    initialYEN?: YenPositionDto;
    rules?: MatchRulesDto;
} | null;

const difficultyLabels: Record<BotDifficulty, string> = {
    easy: 'Fácil',
    medium: 'Media',
    hard: 'Difícil',
    expert: 'Imposible',
};

const modeLabel: Record<'BOT' | 'LOCAL_2P' | 'ONLINE', string> = {
    BOT: 'VS Bot',
    LOCAL_2P: '2 Jugadores',
    ONLINE: 'Online',
};

const RECOVERABLE_ERROR_CODES = new Set([
    'VERSION_CONFLICT',
    'NOT_YOUR_TURN',
    'DUPLICATE_EVENT',
]);

function resolveGameMessage(
    message: GameMessage | null,
    t: (key: string, options?: Record<string, unknown>) => string
): string | null {
    if (!message) return null;
    switch (message.key) {
        case 'clickACellToPlay':          return t('clickACellToPlay');
        case 'botThinking':               return t('botThinking');
        case 'errorCommunicatingWithBot': return t('errorCommunicatingWithBot');
        case 'onlineWaitingServer':       return t('onlineWaitingServer');
        case 'invalidBotMove':            return t('invalidBotMove');
        case 'winnerAnnouncement':        return t('winnerAnnouncement', { label: message.params?.label });
        default:                          return null;
    }
}

function NoConfigFallback({ onNavigate }: { readonly onNavigate: () => void }) {
    const { t } = useTranslation();
    return (
        <Paper sx={{ p: 4, mt: 10, textAlign: 'center', maxWidth: 600, margin: '100px auto' }}>
            <Typography variant="h5" color="primary" sx={{ mb: 2 }}>{t('noConfigTitle')}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>{t('noConfigSubtitle')}</Typography>
            <Button variant="contained" onClick={onNavigate}>{t('createMatch')}</Button>
        </Paper>
    );
}

export default function GameUI() {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const config = location.state as GameConfig;

    const [rematchState, setRematchState] = useState<RematchState>('idle');
    const [rematchRequesterName, setRematchRequesterName] = useState<string | undefined>(undefined);
    const rematchHandled = useRef(false);

    const declineRematchRef = useRef<((matchId: string) => void) | null>(null);
    const rematchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearRematchTimeout = useCallback(() => {
        if (rematchTimeoutRef.current !== null) {
            clearTimeout(rematchTimeoutRef.current);
            rematchTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            if (rematchState === 'pending' && config?.matchId) {
                declineRematchRef.current?.(config.matchId);
            }
            clearRematchTimeout();
        };
    }, []);

    useEffect(() => {
        setRematchState('idle');
        setRematchRequesterName(undefined);
        rematchHandled.current = false;
        clearRematchTimeout();
    }, [config?.matchId, clearRematchTimeout]);

    const rematchCallbacks: RematchCallbacks = {
        onRequested: useCallback((payload: RematchRequestedPayload) => {
            if (payload.matchId !== config?.matchId) return;
            setRematchRequesterName(payload.requesterName);
            setRematchState('incoming');
        }, [config?.matchId]),

        onReady: useCallback((payload: RematchReadyPayload) => {
            if (rematchHandled.current) return;
            rematchHandled.current = true;
            clearRematchTimeout();
            navigate('/gamey', {
                replace: true,
                state: {
                    matchId: payload.newMatchId,
                    boardSize: payload.size,
                    difficulty: config?.difficulty ?? 'easy',
                    mode: 'ONLINE',
                    rules: payload.rules,
                },
            });
        }, [navigate, config?.difficulty, clearRematchTimeout]),

        onDeclined: useCallback((payload: RematchDeclinedPayload) => {
            if (payload.matchId !== config?.matchId) return;
            clearRematchTimeout();
            setRematchState('idle');
        }, [config?.matchId, clearRematchTimeout]),
    };

    const localMode = config?.mode === 'ONLINE' ? 'LOCAL_2P' : config?.mode;

    const { state, actions } = useGameController(
        config?.boardSize,
        localMode,
        config?.initialYEN,
        config?.matchId,
        config?.difficulty || 'easy',
        config?.rules,
    );

    const {
        sessionState,
        error: onlineError,
        connectionStatus,
        playMove,
        applyPieSwapOnline,
        emitTurnTimeout,
        requestRematch,
        acceptRematch,
        declineRematch,
    } = useOnlineSession(
        config?.mode === 'ONLINE' ? config.matchId : null,
        rematchCallbacks,
    );

    declineRematchRef.current = declineRematch;

    const { messages, sendMessage } = useChatSession(
        config?.mode === 'ONLINE' ? config.matchId : null,
    );

    if (!config) {
        return <NoConfigFallback onNavigate={() => navigate('/create-match')} />;
    }

    const isOnline = config.mode === 'ONLINE';
    const localState = state.gameState;

    const displayState = isOnline && sessionState
        ? {
            layout: sessionState.layout,
            size: sessionState.size,
            turn: sessionState.turn,
            winner: sessionState.winner ?? null,
            players: sessionState.players,
            rules: sessionState.rules ?? config.rules ?? { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
        }
        : {
            layout: localState.layout,
            size: localState.size,
            turn: localState.turn,
            winner: null,
            rules: localState.rules ?? config.rules ?? { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
            players: [
                { userId: 0, username: t('player1'), symbol: 'B' as const },
                { userId: 1, username: config.mode === 'BOT' ? 'Bot' : t('player2'), symbol: 'R' as const },
            ],
        };

    const { loading } = state;
    const onlineGameOver = isOnline && Boolean(sessionState?.winner);
    const gameOver = isOnline ? onlineGameOver : state.gameOver;

    const errorMessage = isOnline
        ? (onlineError && !RECOVERABLE_ERROR_CODES.has(onlineError.code) ? onlineError.message : null)
        : state.error;

    const recoverableWarning = isOnline && onlineError && RECOVERABLE_ERROR_CODES.has(onlineError.code)
        ? onlineError.message
        : null;

    const currentTurnLabel = resolveCurrentTurnLabel(
        isOnline,
        displayState.turn,
        displayState.players,
        config.mode,
        t,
    );

    const winnerLabel = (() => {
        if (!gameOver) return null;

        if (isOnline) return resolveWinnerLabel(displayState.winner, displayState.players, t);

        const winnerIndex = displayState.turn === 0 ? 1 : 0;
        const botWon = config.mode === 'BOT' && winnerIndex === 1;

        if (config.mode === 'BOT') {
            return botWon
                ? t('botWins', 'Has perdido. El Bot gana.')
                : t('userBeatsBot', '¡Felicidades, {{label}}! Has vencido al Bot.', { label: t('player1') });
        }

        const winnerName = winnerIndex === 0 ? t('player1') : t('player2');
        return t('winnerAnnouncement', { label: winnerName });
    })();

    const handleBoardClick = (row: number, col: number) => {
        if (isOnline) { void playMove(row, col); return; }
        void actions.handleCellClick(row, col);
    };

    const avatarColor = displayState.turn === 0 ? '#03f303': '#dfff00';
    const stonesPlaced = displayState.layout.split('/').join('').split('').filter((c) => c === 'B' || c === 'R').length;

    const canUsePieSwapLocal =
        !isOnline && config.mode === 'LOCAL_2P'
        && displayState.rules?.pieRule?.enabled
        && displayState.turn === 1 && stonesPlaced === 1 && !gameOver;

    const canUsePieSwapOnline =
        isOnline && sessionState !== null
        && displayState.rules?.pieRule?.enabled
        && displayState.turn === 1 && stonesPlaced === 1 && !gameOver;

    const canUsePieSwap = canUsePieSwapLocal || canUsePieSwapOnline;

    const handlePieSwap = () => {
        if (canUsePieSwapOnline) { applyPieSwapOnline(); return; }
        actions.applyPieSwap();
    };

    const gameMessageText = resolveGameMessage(state.message, t);

    return (
        <Box className={styles.container} sx={{ position: 'relative' }}>
            <HelpButton
                titleKey="help.game.title"
                contentKeys={['help.game.objective', 'help.game.turns', 'help.game.pieRule', 'help.game.honey']}
                buttonSx={{ position: 'fixed', top: 74, right: 16, zIndex: 1400 }}
            />
            <Box className={styles.mainBox} sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                width: '100%',
                maxWidth: 1180,
                minHeight: 'calc(100dvh - 140px)',
            }}>

                {/* ── Sidebar ──────────────────────────────────────────────── */}
                <Box className={styles.sidebar} sx={{ width: { xs: '100%', md: 300 } }}>
                    <Typography variant="h5" className={styles.title}>{t('matchInfo')}</Typography>

                    <Stack spacing={2} mt={2}>
                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent}>
                                <Avatar className={styles.avatarStatic} sx={{ bgcolor: avatarColor }} />
                                <Box textAlign="center">
                                    <Typography variant="subtitle1" color="primary">{t('turn')}</Typography>
                                    <Typography variant="body2" color="text.secondary">{currentTurnLabel}</Typography>
                                </Box>
                            </CardContent>
                        </Card>

                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                <Typography variant="subtitle2" color="primary">{t('mode')}</Typography>
                                <Typography variant="body2" color="text.secondary">{modeLabel[config.mode]}</Typography>
                            </CardContent>
                        </Card>

                        {config.mode === 'BOT' && (
                            <Card className={styles.cardStatic}>
                                <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                    <Typography variant="subtitle2" color="primary">{t('difficulty')}</Typography>
                                    <Typography variant="body2" color="text.secondary">{difficultyLabels[config.difficulty]}</Typography>
                                </CardContent>
                            </Card>
                        )}

                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                <Typography variant="subtitle2" color="primary">Extras</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {displayState.rules?.pieRule?.enabled ? 'Pie ON' : 'Pie OFF'} ·{' '}
                                    {displayState.rules?.honey?.enabled ? 'Honey ON' : 'Honey OFF'}
                                </Typography>
                            </CardContent>
                        </Card>

                        {canUsePieSwap && (
                            <Button variant="contained" color="warning" onClick={handlePieSwap}>
                                Aplicar Pie Rule
                            </Button>
                        )}

                        {isOnline && sessionState && (
                            <>
                                <Card className={styles.cardStatic}>
                                    <CardContent className={styles.cardContent}>
                                        <Typography variant="subtitle2" color="primary">{t('connection')}</Typography>
                                        <ConnectionBadge state={connectionStatus} />
                                    </CardContent>
                                </Card>

                                <Card className={styles.cardStatic}>
                                    <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                                            Tiempo de turno
                                        </Typography>
                                        <TurnTimer timerEndsAt={sessionState.timerEndsAt} onExpire={emitTurnTimeout} />
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </Stack>

                    <Stack spacing={2} sx={{ mt: 'auto', pt: 2 }}>
                        <Button variant="outlined" onClick={() => navigate('/create-match')}>{t('back')}</Button>
                        {!isOnline && (
                            <Button variant="outlined" onClick={actions.newGame}>{t('restart')}</Button>
                        )}
                    </Stack>
                </Box>

                {/* ── Board area ───────────────────────────────────────────── */}
                <Box sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: { xs: 2, md: 4 },
                }}>
                    <Typography variant="h3" className={styles.gameTitle} sx={{ mb: 2 }}>{t('title')}</Typography>

                    {errorMessage && (
                        <Paper sx={{ p: 2, my: 1, width: { xs: '100%', md: '80%' }, textAlign: 'center', borderColor: 'error.main', color: 'error.main' }}>
                            {errorMessage}
                        </Paper>
                    )}

                    {recoverableWarning && (
                        <Paper sx={{ p: 1.5, my: 1, width: { xs: '100%', md: '80%' }, textAlign: 'center', borderColor: 'warning.main', color: 'warning.main', border: '1px solid' }}>
                            <Typography variant="caption">{recoverableWarning}</Typography>
                        </Paper>
                    )}

                    {!isOnline && loading && (
                        <Paper sx={{ p: 2, my: 1 }}>{gameMessageText}</Paper>
                    )}

                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        flexGrow: 1,
                        minHeight: 0,
                        alignItems: 'center',
                        width: '100%',
                    }}>
                        <Paper className={styles.boardPanel} sx={{ mt: 3, p: { xs: 1, sm: 1.5, md: 2 }, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', maxWidth: '100%', overflow: 'visible' }}>
                            <Board
                                layout={displayState.layout}
                                size={displayState.size}
                                onCellClick={handleBoardClick}
                                currentPlayer={displayState.turn}
                                blockedCells={displayState.rules?.honey?.enabled ? displayState.rules.honey.blockedCells : []}
                            />
                        </Paper>

                        {gameOver && (
                            <WinnerOverlay
                                winnerLabel={winnerLabel ?? 'Partida terminada'}
                                onNewGame={() => actions.newGame()}
                                onNavigateHome={() => navigate('/create-match')}
                                isOnline={isOnline}
                                rematchState={rematchState}
                                rematchRequesterName={rematchRequesterName}
                                onRequestRematch={() => {
                                    setRematchState('pending');
                                    requestRematch(config.matchId);
                                    clearRematchTimeout();
                                    rematchTimeoutRef.current = setTimeout(() => {
                                        declineRematchRef.current?.(config.matchId);
                                        setRematchState('idle');
                                    }, 30_000);
                                }}
                                onAcceptRematch={() => acceptRematch(config.matchId)}
                                onDeclineRematch={() => {
                                    clearRematchTimeout();
                                    declineRematch(config.matchId);
                                    setRematchState('idle');
                                }}
                            />
                        )}

                        {isOnline && (
                            <ChatBox
                                matchId={sessionState?.matchId ?? null}
                                winner={displayState.winner ?? null}
                                localUserId={user?.id ?? null}
                                messages={messages}
                                sendMessage={sendMessage}
                            />
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}