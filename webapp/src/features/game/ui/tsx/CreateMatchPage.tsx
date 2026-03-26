import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Paper,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Button,
    Stack,
    Box,
    Alert, // Importamos Alert
} from "@mui/material";
import { useAuth } from "../../../auth";
import { fetchWithAuth } from "../../../../shared/api/fetchWithAuth";
import { API_CONFIG } from "../../../../config/api.config";
import type { BotDifficulty, GameMode } from "../../hooks/useGameController";

export default function CreateMatchPage() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [boardSize, setBoardSize] = useState<number>(8);
    const [difficulty, setDifficulty] = useState<BotDifficulty>("medium");
    const [mode, setMode] = useState<GameMode>("BOT");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreateMatch = async () => {
        if (!token) {
            setError("ACCESO DENEGADO: Debes iniciar sesión para crear una partida");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/matches`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ boardSize, difficulty, mode }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Error creating match");
            }

            const data = await res.json();

            navigate("/gamey", {
                state: {
                    matchId: data.matchId,
                    initialYEN: data.initialYEN,
                    boardSize,
                    mode,
                    difficulty
                }
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start", // Alineado arriba para que el padding funcione mejor
                minHeight: "100vh",
                // Padding superior para compensar el Nav (70px del Nav + 40px de espacio)
                pt: "110px",
                pb: 4,
                px: 2,
                overflow: "auto",
                boxSizing: "border-box"
            }}
        >
            <Paper
                sx={{
                    width: "100%",
                    maxWidth: 500,
                    padding: 4,
                }}
            >
                <Box textAlign="center" mb={4}>
                    <Typography
                        variant="h4"
                        color="primary"
                        sx={{ mb: 1, textShadow: "0 0 8px rgba(57, 255, 20, 0.45)" }}
                    >
                        NUEVA PARTIDA
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary">
                        CONFIGURACIÓN DE SISTEMA
                    </Typography>
                </Box>

                {/* ALERT DE ERROR QUE NO SE COME EL NAV */}
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
                    <FormControl fullWidth>
                        <InputLabel id="board-size-label">Tamaño del tablero</InputLabel>
                        <Select
                            labelId="board-size-label"
                            id="board-size"
                            value={boardSize}
                            label="Tamaño del tablero"
                            onChange={(e) => setBoardSize(Number(e.target.value))}
                        >
                            <MenuItem value={8}>8 x 8</MenuItem>
                            <MenuItem value={16}>16 x 16</MenuItem>
                            <MenuItem value={32}>32 x 32</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl fullWidth>
                        <InputLabel id="game-mode-label">Modo de juego</InputLabel>
                        <Select
                            labelId="game-mode-label"
                            id="game-mode"
                            value={mode}
                            label="Modo de juego"
                            onChange={(e) => setMode(e.target.value as GameMode)}
                        >
                            <MenuItem value="BOT">VS BOT</MenuItem>
                            <MenuItem value="LOCAL_2P">2 JUGADORES (LOCAL)</MenuItem>
                        </Select>
                    </FormControl>

                    {mode === "BOT" && (
                        <FormControl fullWidth>
                            <InputLabel id="difficulty-label">Dificultad</InputLabel>
                            <Select
                                labelId="difficulty-label"
                                id="difficulty"
                                value={difficulty}
                                label="Dificultad"
                                onChange={(e) => setDifficulty(e.target.value as BotDifficulty)}
                            >
                                <MenuItem value="easy">FÁCIL</MenuItem>
                                <MenuItem value="medium">MEDIA</MenuItem>
                                <MenuItem value="hard">DIFÍCIL</MenuItem>
                                <MenuItem value="expert">IMPOSIBLE</MenuItem>
                            </Select>
                        </FormControl>
                    )}

                    <Button
                        variant="contained"
                        onClick={handleCreateMatch}
                        disabled={loading}
                        size="large"
                        sx={{
                            mt: 2,
                            py: 1.5,
                            fontSize: '1.2rem'
                        }}
                    >
                        {loading ? "INICIALIZANDO..." : "CREAR PARTIDA"}
                    </Button>

                    {!token && (
                        <Button
                            variant="outlined"
                            onClick={() => navigate("/login")}
                            sx={{ borderColor: 'rgba(57, 255, 20, 0.3)' }}
                        >
                            IR A LOGIN
                        </Button>
                    )}
                </Stack>
            </Paper>
        </Box>
    );
}