import { Box, Typography, Button, Paper, CircularProgress, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';

export type RematchState = 'idle' | 'pending' | 'incoming';

interface Props {
    winnerLabel: string;
    onNewGame: () => void;
    onNavigateHome: () => void;
    isOnline?: boolean;
    rematchState?: RematchState;
    rematchRequesterName?: string;
    onRequestRematch?: () => void;
    onAcceptRematch?: () => void;
    onDeclineRematch?: () => void;
}

export default function WinnerOverlay({
                                          winnerLabel,
                                          onNewGame,
                                          onNavigateHome,
                                          isOnline = false,
                                          rematchState = 'idle',
                                          rematchRequesterName,
                                          onRequestRematch,
                                          onAcceptRematch,
                                          onDeclineRematch,
                                      }: Props) {
    const { t } = useTranslation();

    return (
        <Box
            sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 10, 0, 0.85)',
                backdropFilter: 'blur(4px)',
                zIndex: 100,
            }}
        >
            <Paper
                sx={{
                    p: 4,
                    textAlign: 'center',
                    border: '2px solid #39ff14',
                    backgroundColor: 'rgba(5, 20, 5, 0.95)',
                    boxShadow: '0 0 30px rgba(57, 255, 20, 0.3)',
                    minWidth: 320,
                }}
            >
                <Typography variant="h2" sx={{ color: '#39ff14', textShadow: '0 0 10px #39ff14', mb: 2 }}>
                    {t('gameOver')}
                </Typography>
                <Typography variant="h5" sx={{ color: 'white', mb: 4 }}>
                    {winnerLabel}
                </Typography>

                {/* ── Rematch section (online only) ── */}
                {isOnline && (
                    <>
                        <Divider sx={{ borderColor: 'rgba(57,255,20,0.25)', mb: 3 }} />

                        {/* Idle: show the "Request rematch" button */}
                        {rematchState === 'idle' && (
                            <Button
                                variant="outlined"
                                onClick={onRequestRematch}
                                sx={{ color: '#39ff14', borderColor: '#39ff14', mb: 3, width: '100%' }}
                            >
                                {t('requestRematch', 'Solicitar revancha')}
                            </Button>
                        )}

                        {/* Pending: waiting for the opponent to respond */}
                        {rematchState === 'pending' && (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 3 }}>
                                <CircularProgress size={18} sx={{ color: '#39ff14' }} />
                                <Typography variant="body2" sx={{ color: '#39ff14' }}>
                                    {t('rematchPending', 'Esperando respuesta del rival…')}
                                </Typography>
                            </Box>
                        )}

                        {/* Incoming: the opponent is asking for a rematch */}
                        {rematchState === 'incoming' && (
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="body1" sx={{ color: 'white', mb: 2 }}>
                                    {t('rematchIncoming', '{{name}} quiere una revancha', {
                                        name: rematchRequesterName ?? t('opponent', 'Tu rival'),
                                    })}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                                    <Button
                                        variant="contained"
                                        onClick={onAcceptRematch}
                                        sx={{ backgroundColor: '#39ff14', color: 'black' }}
                                    >
                                        {t('acceptRematch', 'Aceptar')}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={onDeclineRematch}
                                        sx={{ color: '#ff4444', borderColor: '#ff4444' }}
                                    >
                                        {t('declineRematch', 'Rechazar')}
                                    </Button>
                                </Box>
                            </Box>
                        )}

                        <Divider sx={{ borderColor: 'rgba(57,255,20,0.25)', mb: 3 }} />
                    </>
                )}

                {/* ── Standard actions ── */}
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <Button
                        variant="outlined"
                        onClick={onNavigateHome}
                        sx={{ color: '#39ff14', borderColor: '#39ff14' }}
                    >
                        {t('newConfiguration')}
                    </Button>
                    {!isOnline && (
                        <Button
                            variant="contained"
                            onClick={onNewGame}
                            sx={{ backgroundColor: '#39ff14', color: 'black' }}
                        >
                            {t('playAgain')}
                        </Button>
                    )}
                </Box>
            </Paper>
        </Box>
    );
}