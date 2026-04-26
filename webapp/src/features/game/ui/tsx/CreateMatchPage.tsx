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
    Divider,
} from '@mui/material';
import { useAuth } from '../../../auth';
import { fetchWithAuth } from '../../../../shared/api/fetchWithAuth';
import { API_CONFIG } from '../../../../config/api.config';
import type { BotDifficulty } from '../../hooks/useGameController';
import type { MatchRulesDto } from '../../../../shared/contracts';
import { useTranslation } from 'react-i18next';
import { HelpButton } from '../../../../components/HelpButton';

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
    const { t } = useTranslation();

    const buildRules = (): MatchRulesDto => ({
        pieRule: { enabled: pieRuleEnabled },
        honey: { enabled: honeyEnabled, blockedCells: [] },
    });

    const buttonLabel = loading
        ? t('initializing')
        : mode === 'ONLINE'
            ? t('searchRival')
            : t('createMatch');

    const handleCreateMatch = async () => {
        if (!token) {
            setError(t('accessDeniedLoginToCreateMatch'));
            return;
        }

        if (mode === 'ONLINE') {
            const rules = buildRules();
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
                throw new Error(text || 'Error creating the game');
            }

            const data = await res.json();
            let authoritativeRules = rules;

            try {
                const stateRes = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/matches/${data.matchId}`, {
                    method: 'GET',
                });

                if (stateRes.ok) {
                    const statePayload = await stateRes.json() as { rules?: MatchRulesDto };

                    if (statePayload.rules) {
                        authoritativeRules = statePayload.rules;
                    }
                }
            } catch {
                authoritativeRules = rules;
            }

            navigate('/gamey', {
                state: {
                    matchId: data.matchId,
                    initialYEN: data.initialYEN,
                    boardSize,
                    mode,
                    difficulty,
                    rules: authoritativeRules,
                },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unkown error');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <Box sx={{ textAlign: 'center', mt: '58px', pt: 4 }}>
                <Typography variant="h5" color="error">
                    {t('accessDeniedLoginToCreateMatch')}
                </Typography>
                <Button variant="contained" onClick={() => navigate('/login')} sx={{ mt: 2 }}>
                    {t('goLogin')}
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
            <HelpButton
                titleKey="help.createMatch.title"
                contentKeys={[
                    'help.createMatch.boardSize',
                    'help.createMatch.mode',
                    'help.createMatch.rules',
                    'help.createMatch.extras',
                ]}
            />

            <Paper sx={{ width: '100%', maxWidth: 540, p: 4 }} className="crt-panel">
                <Box textAlign="center" mb={4}>
                    <Typography
                        variant="overline"
                        className="crt-screen-label"
                        sx={{ display: 'block', mb: 1 }}
                    >
                        {t('matchSetup')}
                    </Typography>

                    <Typography
                        variant="h4"
                        className="crt-heading"
                        color="primary"
                        sx={{ mb: 1, textShadow: '0 0 8px rgba(57, 255, 20, 0.45)' }}
                    >
                        {t('newGame')}
                    </Typography>

                    <Typography variant="subtitle1" color="text.secondary">
                        {t('systemConfig')}
                    </Typography>
                </Box>

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
                            {t('boardSize', { boardSize })}
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
                                    fontSize: '0.8rem',
                                },
                            }}
                        />
                    </Box>

                    <FormControl fullWidth>
                        <InputLabel id="game-mode-label">{t('gameMode')}</InputLabel>
                        <Select
                            labelId="game-mode-label"
                            id="game-mode"
                            value={mode}
                            label="Modo de juego"
                            onChange={(e) => setMode(e.target.value as CreateMatchMode)}
                        >
                            <MenuItem value="BOT">
                                {t('vsBot', { defaultValue: 'VS BOT' })}
                            </MenuItem>

                            <MenuItem value="LOCAL_2P">
                                {t('local2pOption', { defaultValue: '2 JUGADORES (LOCAL)' })}
                            </MenuItem>

                            <MenuItem value="ONLINE">
                                {t('onlineOption', { defaultValue: 'ONLINE' })}
                            </MenuItem>
                        </Select>
                    </FormControl>

                    {mode === 'BOT' && (
                        <FormControl fullWidth>
                            <InputLabel id="difficulty-label">{t('difficulty')}</InputLabel>
                            <Select
                                labelId="difficulty-label"
                                id="difficulty"
                                value={difficulty}
                                label="Dificultad"
                                onChange={(e) => setDifficulty(e.target.value as BotDifficulty)}
                            >
                                <MenuItem value="easy">{t('easy')}</MenuItem>
                                <MenuItem value="medium">{t('medium')}</MenuItem>
                                <MenuItem value="hard">{t('difficult')}</MenuItem>
                                <MenuItem value="impossible">{t('imposible')}</MenuItem>
                            </Select>
                        </FormControl>
                    )}

                    <Divider />

                    <Box>
                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                            {t('matchExtras')}
                        </Typography>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={pieRuleEnabled}
                                    onChange={(e) => setPieRuleEnabled(e.target.checked)}
                                />
                            }
                            label={t('pieRule')}
                        />

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={honeyEnabled}
                                    onChange={(e) => setHoneyEnabled(e.target.checked)}
                                />
                            }
                            label={t('honey')}
                        />
                    </Box>

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