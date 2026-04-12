import { useEffect } from 'react';
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
import { useOnlineSession } from '../../hooks/useOnlineSession';
import { useChatSession } from '../../hooks/useChatSession';
import { onlineSocketClient } from '../../realtime/onlineSocketClient';
import type { YenPositionDto } from '../../../../shared/contracts';
import styles from '../css/GameUI.module.css';
import ConnectionBadge from './ConnectionBadge';
import TurnTimer from './TurnTimer';
import ChatBox from './ChatBox';
import { resolveCurrentTurnLabel, resolveWinnerLabel } from './gameUIHelpers.ts';
import WinnerOverlay from './WinnerOverlay';
import {useTranslation} from "react-i18next";

type GameConfig = {
    matchId: string;
    boardSize: number;
    difficulty: BotDifficulty;
    mode: 'BOT' | 'LOCAL_2P' | 'ONLINE';
    initialYEN?: YenPositionDto;
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

function NoConfigFallback({ onNavigate }: { readonly onNavigate: () => void }) {
    const {t} = useTranslation();

    return (
        <Paper sx={{ p: 4, mt: 10, textAlign: 'center', maxWidth: 600, margin: '100px auto' }}>
            <Typography variant="h5" color="primary" sx={{ mb: 2 }}>
                {t('noConfigTitle')}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                {t('noConfigSubtitle')}
            </Typography>
            <Button variant="contained" onClick={onNavigate}>
                {t('createMatch')}
            </Button>
        </Paper>
    );
}

export default function GameUI() {
    const {t} = useTranslation();

    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const config = location.state as GameConfig;

    const localMode = config?.mode === 'ONLINE' ? 'LOCAL_2P' : config?.mode;

    const { state, actions } = useGameController(
        config?.boardSize,
        localMode,
        config?.initialYEN,
        config?.matchId,
        config?.difficulty || 'easy',
    );

    const { sessionState, error: onlineError, connectionStatus, playMove } = useOnlineSession(
        config?.mode === 'ONLINE' ? config.matchId : null,
    );

    const { messages, sendMessage } = useChatSession(
        config?.mode === 'ONLINE' ? config.matchId : null,
    );

    useEffect(() => {
        if (config?.mode !== 'ONLINE') return;
        if (!onlineError) return;

        if (!['sessionTerminal', 'sessionNotFound'].includes(onlineError)) {
            return;
        }

        globalThis.alert(t('sessionUnavailable'));
        navigate('/create-match');
    }, [config?.mode, navigate, onlineError, t]);

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
        }
        : {
            layout: localState.layout,
            size: localState.size,
            turn: localState.turn,
            winner: null,
            players: [
                { userId: 0, username: t('player1'), symbol: 'B' as const },
                { userId: 1, username: config.mode === 'BOT' ? 'Bot' : t('player2'), symbol: 'R' as const },
            ],
        };

    const { loading } = state;
    const localGameOver = state.gameOver;
    const onlineGameOver = isOnline && Boolean(sessionState?.winner);
    const gameOver = isOnline ? onlineGameOver : localGameOver;

    const error = isOnline ? onlineError ?? null : state.error;
    const errorMessage = error ? t(error) : null;

    const currentTurnLabel = resolveCurrentTurnLabel(
        isOnline,
        displayState.turn,
        displayState.players,
        config.mode,
    );

    const winnerLabel = isOnline
        ? resolveWinnerLabel(displayState.winner, displayState.players)
        : state.gameOver
            ? displayState.turn === 1
                ? t('winnerUser1')
                : t('winnerUser2')
            : null;

    const handleBoardClick = (row: number, col: number) => {
        if (isOnline) {
            void playMove(row, col);
            return;
        }
        void actions.handleCellClick(row, col);
    };

    const avatarColor = displayState.turn === 0 ? '#39ff14' : '#8cff68';

    return (
        <Box className={styles.container}>
            <Box className={styles.mainBox} sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                width: '100%',
                maxWidth: 1180,
                minHeight: 'calc(100dvh - 140px)',
            }}>
                <Box className={styles.sidebar} sx={{ width: { xs: '100%', md: 300 } }}>
                    <Typography variant="h5" className={styles.title}>
                        {t('matchInfo')}
                    </Typography>

                    <Stack spacing={2} mt={2}>
                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent}>
                                <Avatar className={styles.avatarStatic} sx={{ bgcolor: avatarColor }} />
                                <Box textAlign="center">
                                    <Typography variant="subtitle1" color="primary">
                                        {t('turn')}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {currentTurnLabel}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>

                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                <Typography variant="subtitle2" color="primary">
                                    {t('mode')}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {modeLabel[config.mode]}
                                </Typography>
                            </CardContent>
                        </Card>

                        {config.mode === 'BOT' && (
                            <Card className={styles.cardStatic}>
                                <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                    <Typography variant="subtitle2" color="primary">
                                        {t('difficulty')}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {difficultyLabels[config.difficulty]}
                                    </Typography>
                                </CardContent>
                            </Card>
                        )}

                        {isOnline && sessionState && (
                            <>
                                <Card className={styles.cardStatic}>
                                    <CardContent className={styles.cardContent}>
                                        <Typography variant="subtitle2" color="primary">
                                            {t('connection')}
                                        </Typography>
                                        <ConnectionBadge state={connectionStatus} />
                                    </CardContent>
                                </Card>

                                <Card className={styles.cardStatic}>
                                    <CardContent className={styles.cardContent}>
                                        <Typography variant="subtitle2" color="primary">
                                            {t('turnTimer')}
                                        </Typography>

                                        <TurnTimer
                                            timerEndsAt={sessionState.timerEndsAt}
                                            onExpire={() => {
                                                onlineSocketClient.emit('turn:timeout', {
                                                    matchId: sessionState.matchId,
                                                    version: sessionState.version,
                                                });
                                            }}
                                        />
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </Stack>

                    <Stack spacing={2} sx={{ mt: 'auto', pt: 2 }}>
                        <Button variant="outlined" onClick={() => navigate('/create-match')}>
                            {t('back')}
                        </Button>

                        {!isOnline && (
                            <Button variant="outlined" onClick={actions.newGame}>
                                {t('restart')}
                            </Button>
                        )}
                    </Stack>
                </Box>

                <Box sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: { xs: 2, md: 4 },
                }}>
                    <Typography variant="h3" className={styles.gameTitle} sx={{ mb: 2 }}>
                        {t('title')}
                    </Typography>

                    {errorMessage && (
                        <Paper sx={{ p: 2, my: 1 }}>
                            {errorMessage}
                        </Paper>
                    )}

                    {!isOnline && loading && (
                        <Paper sx={{ p: 2, my: 1 }}>
                            {state.message.key === 'botThinking' && t('botThinking')}
                        </Paper>
                    )}

                    <Paper className={styles.boardPanel} sx={{ mt: 3 }}>
                        <Board
                            layout={displayState.layout}
                            size={displayState.size}
                            onCellClick={handleBoardClick}
                            currentPlayer={displayState.turn}
                        />
                    </Paper>

                    {gameOver && (
                        <WinnerOverlay
                            winnerLabel={winnerLabel ?? t('gameOver')}
                            onNewGame={actions.newGame}
                            onNavigateHome={() => navigate('/create-match')}
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
    );
}