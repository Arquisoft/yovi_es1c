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

const API_URL = import.meta.env.VITE_GAMEY_API_URL ?? "http://localhost:4000";

export default function CreateMatchPage() {
    const navigate = useNavigate();

    const [boardSize, setBoardSize] = useState<number>(8);
    const [strategy, setStrategy] = useState<string>("random");
    const [difficulty, setDifficulty] = useState<string>("medium");
    const [mode, setMode] = useState<"BOT" | "LOCAL_2P">("BOT");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreateMatch = async () => {
        setLoading(true);
        setError(null);

        try {
            const token = localStorage.getItem("jwt");
            if (!token) throw new Error("No JWT token found");

            const res = await fetch(`${API_URL}/api/game/matches`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ boardSize, strategy, difficulty, mode }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Error creating match");
            }

            const data = await res.json();

            navigate("/gamey", { state: { matchId: data.matchId, initialYEN: data.initialYEN, boardSize, mode } });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    };

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
                background: "radial-gradient(circle at top, #000 0%, #001133 70%)",
            }}
        >
            <Paper
                elevation={12}
                sx={{
                    width: "100%",
                    maxWidth: 500,
                    padding: 4,
                    borderRadius: 2,
                    backgroundColor: "#111",
                    boxShadow: "0 0 10px #ff00d4, 0 0 20px #ff00d4",
                    border: "1px solid #ff00d4",
                    margin: "0 auto",
                }}
            >
                <Box textAlign="center" mb={4}>
                    <Typography
                        variant="h4"
                        sx={{ fontWeight: "bold", color: "#fff", textShadow: "0 0 5px #ff00d4", mb: 1 }}
                    >
                        Crear nueva partida
                    </Typography>
                    <Typography variant="subtitle1" sx={{ color: "#ccc" }}>
                        Configura tu partida y empieza a jugar
                    </Typography>
                </Box>

                {error && (
                    <Typography color="error" sx={{ mb: 2, textAlign: "center" }}>
                        {error}
                    </Typography>
                )}

                <Stack spacing={3}>
                    {/* Tamaño del tablero */}
                    <FormControl fullWidth sx={{ backgroundColor: "#222", borderRadius: 2, border: "1px solid #ff00d4" }}>
                        <InputLabel sx={{ color: "#fff" }}>Tamaño del tablero</InputLabel>
                        <Select
                            value={boardSize}
                            onChange={(e) => setBoardSize(Number(e.target.value))}
                            sx={{ color: "#fff", p: 1.2 }}
                        >
                            <MenuItem value={8}>8 x 8</MenuItem>
                            <MenuItem value={16}>16 x 16</MenuItem>
                            <MenuItem value={32}>32 x 32</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Estrategia */}
                    <FormControl fullWidth sx={{ backgroundColor: "#222", borderRadius: 2, border: "1px solid #ff00d4" }}>
                        <InputLabel sx={{ color: "#fff" }}>Estrategia</InputLabel>
                        <Select value={strategy} onChange={(e) => setStrategy(e.target.value)} sx={{ color: "#fff", p: 1.2 }}>
                            <MenuItem value="random">Random</MenuItem>
                            <MenuItem value="heuristic">Heuristic</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Dificultad */}
                    <FormControl fullWidth sx={{ backgroundColor: "#222", borderRadius: 2, border: "1px solid #ff00d4" }}>
                        <InputLabel sx={{ color: "#fff" }}>Dificultad</InputLabel>
                        <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} sx={{ color: "#fff", p: 1.2 }}>
                            <MenuItem value="easy">Fácil</MenuItem>
                            <MenuItem value="medium">Media</MenuItem>
                            <MenuItem value="hard">Difícil</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Modo de juego */}
                    <FormControl fullWidth sx={{ backgroundColor: "#222", borderRadius: 2, border: "1px solid #ff00d4" }}>
                        <InputLabel sx={{ color: "#fff" }}>Modo de juego</InputLabel>
                        <Select
                            value={mode}
                            onChange={(e) => setMode(e.target.value as "BOT" | "LOCAL_2P")}
                            sx={{ color: "#fff", p: 1.2 }}
                        >
                            <MenuItem value="BOT">VS Bot</MenuItem>
                            <MenuItem value="LOCAL_2P">2 Jugadores</MenuItem>
                        </Select>
                    </FormControl>

                    <Button
                        onClick={handleCreateMatch}
                        disabled={loading}
                        sx={{
                            px: 4,
                            py: 1,
                            borderRadius: 3,
                            fontWeight: "bold",
                            fontSize: "1.1rem",
                            backgroundColor: "#ff00d4",
                            color: "#000",
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            boxShadow: "0 0 8px #ff00d4, 0 0 20px #ff00d4",
                            "&:hover": { backgroundColor: "#e600c9", transform: "scale(1.05)" },
                        }}
                    >
                        {loading ? "Creando partida..." : "Crear partida"}
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
}