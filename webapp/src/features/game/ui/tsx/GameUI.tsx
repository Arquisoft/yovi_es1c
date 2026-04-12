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
import type { MatchRulesDto, YenPositionDto } from '../../../../shared/contracts';
import styles from '../css/GameUI.module.css';
import ConnectionBadge from './ConnectionBadge';
import TurnTimer from './TurnTimer';
import ChatBox from './ChatBox';
import { resolveCurrentTurnLabel, resolveWinnerLabel } from './gameUIHelpers.ts';
import WinnerOverlay from './WinnerOverlay';

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

function NoConfigFallback({ onNavigate }: { readonly onNavigate: () => void }) {
    return (
        <Paper sx={{ p: 4, mt: 10, textAlign: 'center', maxWidth: 600, margin: '100px auto' }}>
            <Typography variant="h5" color="primary" sx={{ mb: 2 }}>
                No se encontró la configuración de la partida
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                Vuelve a la página de crear partida para iniciar un juego.
            </Typography>
            <Button variant="contained" onClick={onNavigate}>
                Crear partida
            </Button>
        </Paper>
    );
}

export default function GameUI() {
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
        config?.rules,
    );

    const {
        sessionState,
        error: onlineError,
        connectionStatus,
        playMove,
        applyPieSwapOnline,
        emitTurnTimeout,
        isTerminalError,
    } = useOnlineSession(
        config?.mode === 'ONLINE' ? config.matchId : null,
    );
    const { messages, sendMessage } = useChatSession(
        config?.mode === 'ONLINE' ? config.matchId : null,
    );

    useEffect(() => {
        if (config?.mode !== 'ONLINE') return;
        if (!isTerminalError) return;
        globalThis.alert('La partida ya no está disponible');
        navigate('/create-match');
    }, [config?.mode, navigate, isTerminalError]);

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
                { userId: 0, username: 'Jugador 1', symbol: 'B' as const },
                { userId: 1, username: config.mode === 'BOT' ? 'Bot' : 'Jugador 2', symbol: 'R' as const },
            ],
        };

    const { loading } = state;
    const localGameOver = state.gameOver;
    const onlineGameOver = isOnline && Boolean(sessionState?.winner);
    const gameOver = isOnline ? onlineGameOver : localGameOver;

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
    );

    const winnerLabel = isOnline
        ? resolveWinnerLabel(displayState.winner, displayState.players)
        : state.gameOver
            ? displayState.turn === 1
                ? `¡Felicidades, ${displayState.players[0].username} gana!`
                : `¡Felicidades, ${displayState.players[1].username} gana!`
            : null;

    const handleBoardClick = (row: number, col: number) => {
        if (isOnline) {
            void playMove(row, col);
            return;
        }
        void actions.handleCellClick(row, col);
    };

    const avatarColor = displayState.turn === 0 ? '#39ff14' : '#8cff68';
    const stonesPlaced = displayState.layout.split('/').join('').split('').filter((c) => c === 'B' || c === 'R').length;

    const canUsePieSwapLocal =
        !isOnline
        && config.mode === 'LOCAL_2P'
        && displayState.rules?.pieRule?.enabled
        && displayState.turn === 1
        && stonesPlaced === 1
        && !gameOver;

    const canUsePieSwapOnline =
        isOnline
        && sessionState !== null
        && displayState.rules?.pieRule?.enabled
        && displayState.turn === 1
        && stonesPlaced === 1
        && !gameOver;

    const canUsePieSwap = canUsePieSwapLocal || canUsePieSwapOnline;

    const handlePieSwap = () => {
        if (canUsePieSwapOnline) {
            applyPieSwapOnline();
        } else {
            actions.applyPieSwap();
        }
    };

    return (
        <Box className={styles.container}>
            <Box
                className={styles.mainBox}
                sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    width: '100%',
                    maxWidth: 1180,
                    minHeight: 'calc(100dvh - 140px)',
                }}
            >
                <Box className={styles.sidebar} sx={{ width: { xs: '100%', md: 300 } }}>
                    <Typography variant="h5" className={styles.title}>
                        Información de partida
                    </Typography>

                    <Stack spacing={2} mt={2}>
                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent}>
                                <Avatar className={styles.avatarStatic} sx={{ bgcolor: avatarColor }} />
                                <Box textAlign="center">
                                    <Typography variant="subtitle1" color="primary">Turno</Typography>
                                    <Typography variant="body2" color="text.secondary">{currentTurnLabel}</Typography>
                                </Box>
                            </CardContent>
                        </Card>

                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                <Typography variant="subtitle2" color="primary">Modo</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {modeLabel[config.mode]}
                                </Typography>
                            </CardContent>
                        </Card>

                        {config.mode === 'BOT' && (
                            <Card className={styles.cardStatic}>
                                <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                    <Typography variant="subtitle2" color="primary">Dificultad</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {difficultyLabels[config.difficulty]}
                                    </Typography>
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
                                    <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                        <Box>
                                            <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>Conexión</Typography>
                                            <ConnectionBadge state={connectionStatus} />
                                        </Box>
                                    </CardContent>
                                </Card>
                                <Card className={styles.cardStatic}>
                                    <CardContent className={styles.cardContent} sx={{ textAlign: 'center' }}>
                                        <Box>
                                            <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>Tiempo de turno</Typography>
                                            <TurnTimer
                                                timerEndsAt={sessionState.timerEndsAt}
                                                onExpire={emitTurnTimeout}
                                            />
                                        </Box>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </Stack>

                    <Stack spacing={2} sx={{ mt: 'auto', pt: 2 }}>
                        {isOnline ? (
                            <Button
                                variant="outlined"
                                onClick={() => navigate('/create-match')}
                                className={styles.restartButton}
                            >
                                Volver
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outlined"
                                    onClick={actions.newGame}
                                    className={styles.restartButton}
                                >
                                    Reiniciar partida
                                </Button>

                                {}
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={() => navigate('/create-match')}
                                >
                                    Nueva Partida
                                </Button>
                            </>
                        )}
                    </Stack>
                </Box>

                <Box
                    sx={{
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: { xs: 2, md: 4 },
                        minHeight: 0,
                    }}
                >
                    <Typography variant="h3" className={styles.gameTitle} sx={{ mb: 2 }}>
                        ¡Tu partida de Y!
                    </Typography>

                    {/* Error terminal o de juego: bloquea visualmente con color rojo */}
                    {errorMessage && (
                        <Paper sx={{ p: 2, my: 1, width: { xs: '100%', md: '80%' }, textAlign: 'center', borderColor: 'error.main', color: 'error.main' }}>
                            {errorMessage}
                        </Paper>
                    )}

                    {/* Aviso menor para errores recuperables (VERSION_CONFLICT, etc.) */}
                    {recoverableWarning && (
                        <Paper sx={{ p: 1.5, my: 1, width: { xs: '100%', md: '80%' }, textAlign: 'center', borderColor: 'warning.main', color: 'warning.main', border: '1px solid' }}>
                            <Typography variant="caption">{recoverableWarning}</Typography>
                        </Paper>
                    )}

                    {!isOnline && loading && (
                        <Paper sx={{ p: 2, my: 1, width: { xs: '100%', md: '80%' }, textAlign: 'center' }}>
                            Bot pensando...
                        </Paper>
                    )}

                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            flexGrow: 1,
                            minHeight: 0,
                            alignItems: 'center',
                            width: '100%',
                        }}
                    >
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
                                onNewGame={() => {
                                    actions.newGame();
                                }}
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
        </Box>
    );
}