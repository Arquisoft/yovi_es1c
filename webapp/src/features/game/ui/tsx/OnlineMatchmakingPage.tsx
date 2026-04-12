import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, Paper, Typography } from '@mui/material';
import { useOnlineMatchmaking } from '../../hooks/useOnlineMatchmaking';
import { useAuth } from '../../../auth/context/useAuth';
import { useTranslation } from 'react-i18next';

export default function OnlineMatchmakingPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { token } = useAuth();
    const config = location.state as { boardSize?: number } | null;
    const boardSize = config?.boardSize ?? 8;
    const { waiting, waitedSec, matched,  error, joinQueue, cancelQueue } = useOnlineMatchmaking(boardSize);
    const {t} = useTranslation();
    
    useEffect(() => {
        if (!token) return;
        let cleanup: (() => void) | undefined;

        void joinQueue().then((fn) => {
            cleanup = fn;
        });

        return () => {
            cleanup?.();
        };
    }, [token, joinQueue]);

    useEffect(() => {
        if (!matched) return;

        if (matched.matchId === '__BOT_FALLBACK__') {
            navigate('/gamey', {
                state: { boardSize, mode: 'BOT', difficulty: 'medium' },
            });
            return;
        }

        navigate('/gamey', {
            state: {
                matchId: matched.matchId,
                boardSize,
                mode: 'ONLINE',
                difficulty: 'medium',
            },
        });
    }, [matched, navigate, boardSize]);

    if (!token) {
        return (
            <Box sx={{ textAlign: 'center', mt: 10 }}>
                <Typography variant="h5" color="error">
                    {t('youMustBeLoggedInToJoinQueue')}
                </Typography>
                <Button variant="contained" onClick={() => navigate('/login')} sx={{ mt: 2 }}>
                    {t('gologin')}
                </Button>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                position: 'absolute',
                top: 58,
                left: 0,
                right: 0,
                minHeight: 'calc(100vh - 58px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                p: 2,
            }}
        >
            <Paper className="crt-panel" sx={{ width: '100%', maxWidth: 560, p: 4, textAlign: 'center' }}>
                <Typography variant="overline" className="crt-screen-label" sx={{ display: 'block', mb: 1 }}>
                    {t('matchmakingqueue')}
                </Typography>
                <Typography variant="h4" className="crt-heading" sx={{ mb: 2 }}>
                    {t('searchingOpponentOnline')}
                </Typography>
                <Typography sx={{ mb: 1 }}> {t('board')}: {boardSize} x {boardSize}</Typography>
                <Typography sx={{ mb: 1 }}>{t('status')}: {waiting ? t('searchingMatch') : t('preparingQueue')}</Typography>
                <Typography sx={{ mb: 3 }}>{t('timeInQueue')}: {waitedSec}s</Typography>

                {error && (
                    <Typography color="error" sx={{ mb: 2 }}>
                        {error}
                    </Typography>
                )}

                <Button
                    variant="outlined"
                    onClick={() => {
                        void cancelQueue();
                        navigate('/create-match');
                    }}
                >
                    {t('cancel')}
                </Button>
            </Paper>
        </Box>
    );
}