import { useLocation, useNavigate } from 'react-router-dom';
import { Board } from './Board.tsx';
import { useGameController, type BotDifficulty } from '../../hooks/useGameController.ts';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import fondo from '../../images/fondo.jpg';
import styles from '../css/GameUI.module.css';
import type { YenPositionDto } from '../../../../shared/contracts';

export default function GameUI() {
  const location = useLocation();
  const navigate = useNavigate();
  const config = location.state as {
    matchId: string;
    boardSize: number;
    difficulty: BotDifficulty;
    mode: 'BOT' | 'LOCAL_2P';
    initialYEN?: YenPositionDto;
  } | null;

  const { state, actions } = useGameController(
    config?.boardSize,
    config?.mode,
    config?.initialYEN,
    config?.matchId,
    config?.difficulty || 'easy',
  );

  const difficultyLabels: Record<BotDifficulty, string> = {
    easy: 'Fácil',
    medium: 'Media',
    hard: 'Difícil',
    expert: 'Imposible',
  };

  if (!config) {
    return (
      <Paper className="crt-panel" sx={{ p: 4, mt: 12, mx: 'auto', width: 'min(92vw, 580px)', textAlign: 'center' }}>
        <Typography variant="h5" className="crt-heading" sx={{ mb: 2 }}>
          No se encontró la configuración de la partida
        </Typography>
        <Typography className="crt-muted" sx={{ mb: 3, letterSpacing: '0.08em' }}>
          Vuelve a la página de crear partida para iniciar un juego.
        </Typography>
        <Button onClick={() => navigate('/create-match')} variant="contained">
          Crear partida
        </Button>
      </Paper>
    );
  }

  const { gameState, loading, error, gameOver } = state;
  const playerColors = ['#39ff14', '#90ff5c'];

  return (
    <Box
      className={styles.container}
      sx={{
        backgroundImage:
          `linear-gradient(rgba(0, 16, 0, 0.92), rgba(0, 12, 0, 0.95)), radial-gradient(circle at 50% 15%, rgba(57, 255, 20, 0.18), transparent 22%), url(${fondo})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <Box className={styles.mainBox}>
        <Box className={styles.sidebar}>
          <Typography variant="h5" className={styles.title}>
            Información de partida
          </Typography>

          <Stack spacing={2} mt={2}>
            <Card className={styles.cardStatic}>
              <CardContent className={styles.cardContent}>
                <Avatar className={styles.avatarStatic} sx={{ bgcolor: playerColors[gameState.turn] }} />
                <Box textAlign="center">
                  <Typography className="crt-screen-label" sx={{ fontSize: '0.78rem', mb: 0.3 }}>
                    Turno
                  </Typography>
                  <Typography sx={{ color: 'text.primary' }}>
                    {gameState.turn === 0 ? 'Jugador 1' : config.mode === 'BOT' ? 'Bot' : 'Jugador 2'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            <Card className={styles.cardStatic}>
              <CardContent className={styles.cardContent} sx={{ flexDirection: 'column', gap: 0.5 }}>
                <Typography className="crt-screen-label" sx={{ fontSize: '0.78rem' }}>
                  Modo
                </Typography>
                <Typography sx={{ color: 'text.primary' }}>{config.mode === 'BOT' ? 'VS Bot' : '2 Jugadores'}</Typography>
              </CardContent>
            </Card>

            {config.mode === 'BOT' && (
              <Card className={styles.cardStatic}>
                <CardContent className={styles.cardContent} sx={{ flexDirection: 'column', gap: 0.5 }}>
                  <Typography className="crt-screen-label" sx={{ fontSize: '0.78rem' }}>
                    Dificultad
                  </Typography>
                  <Typography sx={{ color: 'text.primary' }}>{difficultyLabels[config.difficulty]}</Typography>
                </CardContent>
              </Card>
            )}
          </Stack>

          <Button onClick={actions.newGame} className={styles.restartButton} variant="contained" sx={{ py: 1.15 }}>
            Reiniciar partida
          </Button>
        </Box>

        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: { xs: 2, md: 4 } }}>
          <Typography variant="h3" className={styles.gameTitle} sx={{ textAlign: 'center', mb: 1.5 }}>
            ¡Tu partida de Y!
          </Typography>
          <Typography className="crt-screen-label crt-blink" sx={{ mb: 2, fontSize: '0.82rem' }}>
            phosphor match console
          </Typography>

          {error && (
            <Alert severity="error" className={styles.statusPanel} sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}

          {loading && (
            <Paper className={`${styles.statusPanel} crt-panel`} sx={{ px: 2, py: 1.4, textAlign: 'center', mb: 1.5 }}>
              <Typography className="crt-heading" sx={{ fontSize: '1.15rem' }}>
                Bot pensando...
              </Typography>
            </Paper>
          )}

          <Paper className={styles.boardPanel}>
            <Board layout={gameState.layout} size={gameState.size} onCellClick={actions.handleCellClick} currentPlayer={gameState.turn} />
          </Paper>

          {gameOver && (
            <Typography variant="h4" className={styles.gameOver} sx={{ mt: 3, textAlign: 'center' }}>
              ¡Partida terminada!
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
