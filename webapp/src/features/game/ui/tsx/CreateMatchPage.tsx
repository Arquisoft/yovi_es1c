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
            setError("Debes iniciar sesión para crear una partida");
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

    if (!token) {
        return (
            <Box sx={{ textAlign: "center", mt: 4 }}>
                <Typography variant="h5" color="error">
                    Debes iniciar sesión para crear una partida
                </Typography>
                <Button variant="contained" onClick={() => navigate("/login")} sx={{ mt: 2 }}>
                    Ir a Login
                </Button>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                position: "absolute",
                top: 70,
                left: 0,
                right: 0,
                minHeight: "calc(100vh - 70px)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 2,
                overflow: "auto",
            }}
        >
            <Paper
                sx={{
                    width: "100%",
                    maxWidth: 500,
                    padding: 4,
                    margin: "0 auto",
                }}
            >
                <Box textAlign="center" mb={4}>
                    <Typography
                        variant="h4"
                        color="primary"
                        sx={{ mb: 1, textShadow: "0 0 8px rgba(57, 255, 20, 0.45)" }}
                    >
                        Crear nueva partida
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary">
                        Configura tu partida y empieza a jugar
                    </Typography>
                </Box>

                {error && (
                    <Typography color="error" sx={{ mb: 2, textAlign: "center" }}>
                        {error}
                    </Typography>
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
                            <MenuItem value="BOT">VS Bot</MenuItem>
                            <MenuItem value="LOCAL_2P">2 Jugadores</MenuItem>
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
                                <MenuItem value="easy">Fácil</MenuItem>
                                <MenuItem value="medium">Media</MenuItem>
                                <MenuItem value="hard">Difícil</MenuItem>
                                <MenuItem value="expert">Imposible</MenuItem>
                            </Select>
                        </FormControl>
                    )}

                    <Button
                        variant="contained"
                        onClick={handleCreateMatch}
                        disabled={loading}
                        sx={{ mt: 2 }}
                    >
                        {loading ? "Creando partida..." : "Crear partida"}
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
}