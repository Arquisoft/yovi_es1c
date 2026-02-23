import { useLocation } from "react-router-dom";
import { Board } from "./Board";
import { useGameController } from "../hooks/useGameController";
import {
    Box,
    Typography,
    Button,
    Card,
    CardContent,
    Avatar,
    Stack,
    Paper,
} from "@mui/material";

export default function GameUI() {
    const location = useLocation();
    const config = location.state as {
        boardSize: number;
        strategy: string;
        difficulty: string;
        mode: "BOT" | "LOCAL_2P";
    } | null;

    const { state, actions } = useGameController(config?.boardSize, config?.mode);
    const { gameState, loading, error, gameOver } = state;

    const playerColors = ["#4fc3f7", "#f44336"];

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                minHeight: "100vh",
                bgcolor: "#e1f5fe",
                overflowX: "hidden",
            }}
        >
            {/* Sidebar */}
            <Box
                sx={{
                    width: { xs: "100%", md: 280 },
                    bgcolor: "#29b6f6",
                    p: 3,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    borderTopRightRadius: { md: 24 },
                    borderBottomRightRadius: { md: 24 },
                    mb: { xs: 2, md: 0 },
                }}
            >
                <Box>
                    <Typography
                        variant="h5"
                        gutterBottom
                        fontWeight="bold"
                        color="white"
                        textAlign="center"
                    >
                        Información de partida
                    </Typography>

                    <Stack spacing={2} mt={2}>
                        {/* Turno */}
                        <Card sx={{ borderRadius: 4, bgcolor: "#ffffffcc", p: 1 }}>
                            <CardContent
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 2,
                                    justifyContent: "center",
                                }}
                            >
                                <Avatar
                                    sx={{
                                        bgcolor: playerColors[gameState.turn],
                                        width: 50,
                                        height: 50,
                                    }}
                                />
                                <Box textAlign="center">
                                    <Typography variant="subtitle1" fontWeight="bold">
                                        Turno
                                    </Typography>
                                    <Typography variant="body2">
                                        {gameState.turn === 0
                                            ? "Jugador 1"
                                            : config?.mode === "BOT"
                                                ? "Bot"
                                                : "Jugador 2"}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>

                        {/* Modo */}
                        <Card sx={{ borderRadius: 4, bgcolor: "#ffffffcc", p: 1 }}>
                            <CardContent sx={{ textAlign: "center" }}>
                                <Typography variant="subtitle2" fontWeight="bold">
                                    Modo
                                </Typography>
                                <Typography variant="body2">
                                    {config?.mode === "BOT" ? "VS Bot" : "2 Jugadores"}
                                </Typography>
                            </CardContent>
                        </Card>

                        {/* Estrategia / dificultad */}
                        {config?.mode === "BOT" && (
                            <>
                                <Card sx={{ borderRadius: 4, bgcolor: "#ffffffcc", p: 1 }}>
                                    <CardContent sx={{ textAlign: "center" }}>
                                        <Typography variant="subtitle2" fontWeight="bold">
                                            Estrategia
                                        </Typography>
                                        <Typography variant="body2">{config.strategy}</Typography>
                                    </CardContent>
                                </Card>
                                <Card sx={{ borderRadius: 4, bgcolor: "#ffffffcc", p: 1 }}>
                                    <CardContent sx={{ textAlign: "center" }}>
                                        <Typography variant="subtitle2" fontWeight="bold">
                                            Dificultad
                                        </Typography>
                                        <Typography variant="body2">{config.difficulty}</Typography>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </Stack>
                </Box>

                <Button
                    variant="contained"
                    onClick={actions.newGame}
                    sx={{
                        mt: 4,
                        py: 2,
                        fontWeight: "bold",
                        borderRadius: 12,
                        bgcolor: "#03a9f4",
                        "&:hover": { bgcolor: "#0288d1" },
                        width: "100%",
                        boxShadow: 5,
                        fontSize: "1.2rem",
                    }}
                >
                    🎮 Reiniciar partida
                </Button>
            </Box>

            {/* Main Game Area */}
            <Box
                sx={{
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    p: { xs: 2, md: 4 },
                }}
            >
                {/* Título gamificado */}
                <Typography
                    variant="h3"
                    gutterBottom
                    fontWeight="bold"
                    sx={{
                        textAlign: "center",
                        mb: 2,
                        background: "linear-gradient(90deg, #4fc3f7, #0288d1)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                    }}
                >
                    ¡Tu partida de Y!
                </Typography>

                {/* Mensajes */}
                {error && (
                    <Paper
                        sx={{
                            bgcolor: "#ffcdd2",
                            p: 2,
                            borderRadius: 4,
                            my: 1,
                            width: { xs: "100%", md: "80%" },
                        }}
                    >
                        <Typography color="error" align="center">
                            {error}
                        </Typography>
                    </Paper>
                )}

                {loading && (
                    <Paper
                        sx={{
                            bgcolor: "#b3e5fc",
                            p: 2,
                            borderRadius: 4,
                            my: 1,
                            width: { xs: "100%", md: "80%" },
                        }}
                    >
                        <Typography color="info.main" align="center">
                            Bot pensando...
                        </Typography>
                    </Paper>
                )}

                <Paper
                    elevation={6}
                    sx={{
                        mt: 3,
                        p: 2,
                        borderRadius: 4,
                        bgcolor: "#81d4fa",
                        display: "flex",
                        justifyContent: "center",
                        overflow: "auto",
                        width: "100%",
                        maxWidth: 600,
                    }}
                >
                    <Board
                        layout={gameState.layout}
                        size={gameState.size}
                        onCellClick={actions.handleCellClick}
                        currentPlayer={gameState.turn}
                        isDark={false}
                    />
                </Paper>

                {gameOver && (
                    <Typography
                        variant="h4"
                        color="secondary"
                        sx={{
                            mt: 3,
                            fontWeight: "bold",
                            textShadow: "1px 1px 2px #f44336",
                            textAlign: "center",
                        }}
                    >
                        ¡Partida terminada!
                    </Typography>
                )}
            </Box>
        </Box>
    );
}