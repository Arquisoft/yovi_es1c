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
    Slider,
    Checkbox,
    FormControlLabel,
    TextField,
    Divider,
} from '@mui/material';
import { useAuth } from '../../../auth';
import { fetchWithAuth } from '../../../../shared/api/fetchWithAuth';
import { API_CONFIG } from '../../../../config/api.config';
import type { BotDifficulty } from '../../hooks/useGameController';
import type { MatchRulesDto } from '../../../../shared/contracts';

type CreateMatchMode = 'BOT' | 'LOCAL_2P' | 'ONLINE';

export default function CreateMatchPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [boardSize, setBoardSize] = useState<number>(8);
    const [difficulty, setDifficulty] = useState<BotDifficulty>('medium');
    const [mode, setMode] = useState<CreateMatchMode>('BOT');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pieRuleEnabled, setPieRuleEnabled] = useState(false);
    const [honeyEnabled, setHoneyEnabled] = useState(false);
    const [blockedCellsText, setBlockedCellsText] = useState('1,0');

    const parseBlockedCells = (): MatchRulesDto['honey']['blockedCells'] => {
        if (!honeyEnabled) return [];
        return blockedCellsText
            .split(';')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => {
                const [rowRaw, colRaw] = entry.split(',').map((part) => Number(part.trim()));
                if (!Number.isInteger(rowRaw) || !Number.isInteger(colRaw) || rowRaw < 0 || colRaw < 0) {
                    throw new Error(`Coordenada inválida: "${entry}". Usa formato row,col`);
                }
                return { row: rowRaw, col: colRaw };
            });
    };

    const buildRules = (): MatchRulesDto => ({
        pieRule: { enabled: pieRuleEnabled },
        honey: { enabled: honeyEnabled, blockedCells: honeyEnabled ? parseBlockedCells() : [] },
    });

    const buttonLabel = loading
        ? 'INICIALIZANDO...'
        : mode === 'ONLINE'
            ? 'BUSCAR RIVAL'
            : 'CREAR PARTIDA';

    const handleCreateMatch = async () => {
        if (!token) {
            setError('ACCESO DENEGADO: Debes iniciar sesión para crear una partida');
            return;
        }

        if (mode === 'ONLINE') {
            let rules: MatchRulesDto;
            try {
                rules = buildRules();
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Configuración de Honey inválida');
                return;
            }
            navigate('/online/matchmaking', { state: { boardSize, rules } });
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const rules = buildRules();
            const res = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/matches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ boardSize, difficulty, mode, rules }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Error creando la partida');
            }

            const data = await res.json();

            navigate('/gamey', {
                state: {
                    matchId: data.matchId,
                    initialYEN: data.initialYEN,
                    boardSize,
                    mode,
                    difficulty,
                    rules,
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
            <Box sx={{ textAlign: 'center', mt: '58px', pt: 4 }}>
                <Typography variant="h5" color="error">
                    ACCESO DENEGADO: Debes iniciar sesión para crear una partida
                </Typography>
                <Button variant="contained" onClick={() => navigate('/login')} sx={{ mt: 2 }}>
                    IR A LOGIN
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
                overflow: 'auto',
            }}
        >
            {}
            <Paper sx={{ width: '100%', maxWidth: 540, p: 4 }} className="crt-panel">
                <Box textAlign="center" mb={4}>
                    <Typography
                        variant="overline"
                        className="crt-screen-label"
                        sx={{ display: 'block', mb: 1 }}
                    >
                        Match setup
                    </Typography>
                    <Typography
                        variant="h4"
                        className="crt-heading"
                        color="primary"
                        sx={{ mb: 1, textShadow: '0 0 8px rgba(57, 255, 20, 0.45)' }}
                    >
                        NUEVA PARTIDA
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary">
                        CONFIGURACIÓN DE SISTEMA
                    </Typography>
                </Box>

                {}
                {error && (
                    <Alert
                        severity="error"
                        onClose={() => setError(null)}
                        sx={{
                            mb: 3,
                            fontSize: '1.1rem',
                            border: '1px solid #ff5f5f',
                        }}
                    >
                        {error}
                    </Alert>
                )}

                <Stack spacing={3}>
                    <Box sx={{ px: 1 }}>
                        <Typography id="board-size-slider" gutterBottom color="primary" variant="subtitle2">
                            TAMAÑO DEL TABLERO: {boardSize} x {boardSize}
                        </Typography>
                        <Slider
                            aria-labelledby="board-size-slider"
                            value={boardSize}
                            onChange={(_, newValue) => setBoardSize(newValue as number)}
                            min={8}
                            max={32}
                            step={1}
                            valueLabelDisplay="auto"
                            marks={[
                                { value: 8, label: '8' },
                                { value: 16, label: '16' },
                                { value: 24, label: '24' },
                                { value: 32, label: '32' },
                            ]}
                            sx={{
                                mt: 1,
                                '& .MuiSlider-markLabel': {
                                    color: 'text.secondary',
                                    fontSize: '0.8rem'
                                }
                            }}
                        />
                    </Box>

                    <FormControl fullWidth>
                        <InputLabel id="game-mode-label">Modo de juego</InputLabel>
                        <Select
                            labelId="game-mode-label"
                            id="game-mode"
                            value={mode}
                            label="Modo de juego"
                            onChange={(e) => setMode(e.target.value as CreateMatchMode)}
                        >
                            {}
                            <MenuItem value="BOT">VS BOT</MenuItem>
                            <MenuItem value="LOCAL_2P">2 JUGADORES (LOCAL)</MenuItem>
                            <MenuItem value="ONLINE">ONLINE</MenuItem>
                        </Select>
                    </FormControl>

                    {mode === 'BOT' && (
                        <FormControl fullWidth>
                            <InputLabel id="difficulty-label">Dificultad</InputLabel>
                            <Select
                                labelId="difficulty-label"
                                id="difficulty"
                                value={difficulty}
                                label="Dificultad"
                                onChange={(e) => setDifficulty(e.target.value as BotDifficulty)}
                            >
                                {}
                                <MenuItem value="easy">FÁCIL</MenuItem>
                                <MenuItem value="medium">MEDIA</MenuItem>
                                <MenuItem value="hard">DIFÍCIL</MenuItem>
                                <MenuItem value="expert">IMPOSIBLE</MenuItem>
                            </Select>
                        </FormControl>
                    )}

                    <Divider />
                    <Box>
                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                            Extras de partida
                        </Typography>
                        <FormControlLabel
                            control={<Checkbox checked={pieRuleEnabled} onChange={(e) => setPieRuleEnabled(e.target.checked)} />}
                            label="Pie Rule"
                        />
                        <FormControlLabel
                            control={<Checkbox checked={honeyEnabled} onChange={(e) => setHoneyEnabled(e.target.checked)} />}
                            label="Honey (celdas bloqueadas)"
                        />
                        {honeyEnabled && (
                            <TextField
                                label="Bloqueadas (row,col; row,col)"
                                value={blockedCellsText}
                                onChange={(e) => setBlockedCellsText(e.target.value)}
                                fullWidth
                                size="small"
                                helperText="Ejemplo: 1,0; 2,1"
                                sx={{ mt: 1 }}
                            />
                        )}
                    </Box>

                    {}
                    <Button
                        variant="contained"
                        onClick={handleCreateMatch}
                        disabled={loading}
                        size="large"
                        sx={{
                            mt: 2,
                            py: 1.5,
                            fontSize: '1.2rem',
                        }}
                    >
                        {buttonLabel}
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
}