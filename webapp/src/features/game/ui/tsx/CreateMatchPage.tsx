import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useAuth } from '../../../auth';
import { fetchWithAuth } from '../../../../shared/api/fetchWithAuth';
import { API_CONFIG } from '../../../../config/api.config';
import type { BotDifficulty, GameMode } from '../../hooks/useGameController';

const panelSx = {
  width: '100%',
  maxWidth: 520,
  px: { xs: 2.5, sm: 4.5 },
  py: { xs: 3, sm: 4.5 },
  position: 'relative',
};

const formControlSx = {
  '& .MuiInputLabel-root': {
    letterSpacing: '0.12em',
  },
};

export default function CreateMatchPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [boardSize, setBoardSize] = useState<number>(8);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('medium');
  const [mode, setMode] = useState<GameMode>('BOT');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateMatch = async () => {
    if (!token) {
      setError('Debes iniciar sesión para crear una partida');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          boardSize,
          difficulty,
          mode,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Error creating match');
      }

      const data = await res.json();

      navigate('/gamey', {
        state: {
          matchId: data.matchId,
          initialYEN: data.initialYEN,
          boardSize,
          mode,
          difficulty,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          pt: '58px',
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'radial-gradient(circle at 50% 26%, rgba(53,137,42,0.2), transparent 24%), linear-gradient(180deg, rgba(4,18,4,0.96) 0%, rgba(1,10,1,0.96) 100%)',
        }}
      >
        <Paper className="crt-panel" sx={{ ...panelSx, textAlign: 'center' }}>
          <Typography className="crt-screen-label crt-blink" sx={{ mb: 1, fontSize: '0.8rem' }}>
            Access required
          </Typography>
          <Typography variant="h4" className="crt-heading" sx={{ mb: 2 }}>
            Debes iniciar sesión para crear una partida
          </Typography>
          <Typography className="crt-muted" sx={{ mb: 3, letterSpacing: '0.08em' }}>
            Inserta tus credenciales para acceder al terminal de juego.
          </Typography>
          <Button onClick={() => navigate('/login')} variant="contained">
            Ir a Login
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        pt: '58px',
        px: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 50% 22%, rgba(53,137,42,0.22), transparent 24%), linear-gradient(180deg, rgba(4,18,4,0.96) 0%, rgba(1,10,1,0.96) 100%)',
      }}
    >
      <Paper className="crt-panel" sx={panelSx}>
        <Typography className="crt-screen-label crt-blink" sx={{ mb: 1.25, fontSize: '0.8rem', textAlign: 'center' }}>
          Configuración del sistema
        </Typography>
        <Box textAlign="center" mb={3.5}>
          <Typography variant="h4" className="crt-heading" sx={{ mb: 1.2 }}>
            Crear nueva partida
          </Typography>
          <Typography className="crt-muted" sx={{ letterSpacing: '0.08em' }}>
            Ajusta el tablero y prepara la sesión de juego.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2.5 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={3}>
          <FormControl fullWidth sx={formControlSx}>
            <InputLabel id="board-size-label">Tamaño del tablero</InputLabel>
            <Select
              labelId="board-size-label"
              value={boardSize}
              label="Tamaño del tablero"
              onChange={(event) => setBoardSize(Number(event.target.value))}
            >
              <MenuItem value={8}>8 x 8</MenuItem>
              <MenuItem value={16}>16 x 16</MenuItem>
              <MenuItem value={32}>32 x 32</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth sx={formControlSx}>
            <InputLabel id="game-mode-label">Modo de juego</InputLabel>
            <Select
              labelId="game-mode-label"
              value={mode}
              label="Modo de juego"
              onChange={(event) => setMode(event.target.value as GameMode)}
            >
              <MenuItem value="BOT">VS Bot</MenuItem>
              <MenuItem value="LOCAL_2P">2 Jugadores</MenuItem>
            </Select>
          </FormControl>

          {mode === 'BOT' && (
            <FormControl fullWidth sx={formControlSx}>
              <InputLabel id="difficulty-label">Dificultad</InputLabel>
              <Select
                labelId="difficulty-label"
                value={difficulty}
                label="Dificultad"
                onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}
              >
                <MenuItem value="easy">Fácil</MenuItem>
                <MenuItem value="medium">Media</MenuItem>
                <MenuItem value="hard">Difícil</MenuItem>
                <MenuItem value="expert">Imposible</MenuItem>
              </Select>
            </FormControl>
          )}

          <Button onClick={handleCreateMatch} disabled={loading} variant="contained" sx={{ py: 1.2 }}>
            {loading ? 'Creando partida...' : 'Crear partida'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
