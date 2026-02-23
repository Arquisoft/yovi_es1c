import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Container,
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

export default function CreateMatchPage() {
    const navigate = useNavigate();

    const [boardSize, setBoardSize] = useState(8);
    const [strategy, setStrategy] = useState("random");
    const [difficulty, setDifficulty] = useState("medium");
    const [mode, setMode] = useState<"BOT" | "LOCAL_2P">("BOT");

    const handleCreateMatch = () => {
        const matchConfig = { boardSize, strategy, difficulty, mode };
        navigate("/gamey", { state: matchConfig });
    };

    return (
        <Container maxWidth="sm" sx={{ mt: 6, mb: 6 }}>
            <Paper
                elevation={6}
                sx={{
                    p: 4,
                    borderRadius: 5,
                    backgroundColor: "#fff",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                }}
            >
                <Box textAlign="center" mb={4}>
                    <Typography
                        variant="h4"
                        fontWeight="bold"
                        color="#0288d1"
                        mt={1}
                        mb={1}
                    >
                        Crear nueva partida
                    </Typography>
                    <Typography variant="subtitle1" color="#555">
                        Configura tu partida y empieza a jugar
                    </Typography>
                </Box>

                <Stack spacing={3}>
                    {/* Tamaño del tablero */}
                    <FormControl fullWidth sx={{ backgroundColor: "#f5f5f5", borderRadius: 3 }}>
                        <InputLabel>Tamaño del tablero</InputLabel>
                        <Select
                            value={boardSize}
                            label="Tamaño del tablero"
                            onChange={(e) => setBoardSize(Number(e.target.value))}
                            sx={{
                                borderRadius: 3,
                                "& .MuiSelect-select": { padding: "12px" },
                            }}
                        >
                            <MenuItem value={8}>8 x 8</MenuItem>
                            <MenuItem value={16}>16 x 16</MenuItem>
                            <MenuItem value={32}>32 x 32</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Estrategia */}
                    <FormControl fullWidth sx={{ backgroundColor: "#f5f5f5", borderRadius: 3 }}>
                        <InputLabel>Estrategia</InputLabel>
                        <Select
                            value={strategy}
                            label="Estrategia"
                            onChange={(e) => setStrategy(e.target.value)}
                            sx={{
                                borderRadius: 3,
                                "& .MuiSelect-select": { padding: "12px" },
                            }}
                        >
                            <MenuItem value="random">Random</MenuItem>
                            <MenuItem value="heuristic">Heuristic</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Dificultad */}
                    <FormControl fullWidth sx={{ backgroundColor: "#f5f5f5", borderRadius: 3 }}>
                        <InputLabel>Dificultad</InputLabel>
                        <Select
                            value={difficulty}
                            label="Dificultad"
                            onChange={(e) => setDifficulty(e.target.value)}
                            sx={{
                                borderRadius: 3,
                                "& .MuiSelect-select": { padding: "12px" },
                            }}
                        >
                            <MenuItem value="easy">Fácil</MenuItem>
                            <MenuItem value="medium">Media</MenuItem>
                            <MenuItem value="hard">Difícil</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Modo de juego */}
                    <FormControl fullWidth sx={{ backgroundColor: "#f5f5f5", borderRadius: 3 }}>
                        <InputLabel>Modo de juego</InputLabel>
                        <Select
                            value={mode}
                            label="Modo de juego"
                            onChange={(e) => setMode(e.target.value as "BOT" | "LOCAL_2P")}
                            sx={{
                                borderRadius: 3,
                                "& .MuiSelect-select": { padding: "12px" },
                            }}
                        >
                            <MenuItem value="BOT">VS Bot</MenuItem>
                            <MenuItem value="LOCAL_2P">2 Jugadores</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Botón crear partida */}
                    <Button
                        variant="contained"
                        size="large"
                        onClick={handleCreateMatch}
                        sx={{
                            mt: 2,
                            py: 2,
                            borderRadius: 5,
                            fontWeight: "bold",
                            fontSize: "1.2rem",
                            backgroundColor: "#03a9f4",
                            color: "#fff",
                            transition: "all 0.3s",
                            "&:hover": {
                                backgroundColor: "#0288d1",
                                transform: "scale(1.05)",
                            },
                        }}
                    >
                        Crear partida
                    </Button>
                </Stack>
            </Paper>
        </Container>
    );
}