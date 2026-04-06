import { Box, Typography, Button, Paper } from '@mui/material';

interface Props {
    winnerLabel: string;
    onNewGame: () => void;
    onNavigateHome: () => void;
}

export default function WinnerOverlay({ winnerLabel, onNewGame, onNavigateHome }: Props) {
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
                }}
            >
                <Typography variant="h2" sx={{ color: '#39ff14', textShadow: '0 0 10px #39ff14', mb: 2 }}>
                    ¡FIN DEL JUEGO!
                </Typography>
                <Typography variant="h5" sx={{ color: 'white', mb: 4 }}>
                    {winnerLabel}
                </Typography>

                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <Button variant="outlined" onClick={onNavigateHome} sx={{ color: '#39ff14', borderColor: '#39ff14' }}>
                        Nueva configuración
                    </Button>
                    <Button variant="contained" onClick={onNewGame} sx={{ backgroundColor: '#39ff14', color: 'black' }}>
                        Jugar de nuevo
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
}