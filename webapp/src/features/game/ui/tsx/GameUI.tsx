import { useLocation, useNavigate } from "react-router-dom";
import { Board } from "./Board.tsx";
import { useGameController, type BotDifficulty } from "../../hooks/useGameController.ts";
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
import styles from "../css/GameUI.module.css";
import type {YenPositionDto} from "../../../../shared/contracts";

export default function GameUI() {
    const location = useLocation();
    const navigate = useNavigate();
    const config = location.state as {
        matchId: string;
        boardSize: number;
        difficulty: BotDifficulty;
        mode: "BOT" | "LOCAL_2P";
        initialYEN?: YenPositionDto;
    } | null;

    const { state, actions } = useGameController(
        config?.boardSize,
        config?.mode,
        config?.initialYEN,
        config?.matchId,
        config?.difficulty || "easy"
    );

    const difficultyLabels: Record<BotDifficulty, string> = {
        easy: "Fácil",
        medium: "Media",
        hard: "Difícil",
        expert: "Imposible",
    };

    if (!config) {
        return (
            <Paper sx={{ p:4, mt:10, textAlign:"center", maxWidth: 600, margin: "100px auto" }}>
                <Typography variant="h5" color="primary" sx={{ mb:2 }}>No se encontró la configuración de la partida</Typography>
                <Typography color="text.secondary" sx={{ mb:2 }}>Vuelve a la página de crear partida para iniciar un juego.</Typography>
                <Button variant="contained" onClick={() => navigate("/create-match")}>Crear partida</Button>
            </Paper>
        )
    }
    const { gameState, loading, error, gameOver } = state;

    // Cambiamos los colores de los jugadores para seguir el Phosphor Theme
    const playerColors = ["#39ff14", "#90ff5c"];

    return (
        <Box
            className={styles.container}
            sx={{
                position: "absolute",
                top: "100px",
                left: 0,
                right: 0,
                minHeight: "calc(100vh - 100px)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 2,
                overflow: "auto"
            }}
        >
            <Box
                className={styles.mainBox}
                sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, width: "100%", maxWidth: 1200, minHeight: "80vh" }}
            >
                <Box className={styles.sidebar} sx={{ width: { xs: "100%", md: 280 } }}>
                    <Typography variant="h5" className={styles.title}>
                        Información de partida
                    </Typography>

                    <Stack spacing={2} mt={2}>
                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent}>
                                <Avatar className={styles.avatarStatic} sx={{ bgcolor: playerColors[gameState.turn] }} />
                                <Box textAlign="center">
                                    <Typography variant="subtitle1" color="primary">Turno</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {gameState.turn === 0 ? "Jugador 1" : config?.mode === "BOT" ? "Bot"
                                            : "Jugador 2"}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>

                        <Card className={styles.cardStatic}>
                            <CardContent className={styles.cardContent} sx={{ textAlign: "center" }}>
                                <Typography variant="subtitle2" color="primary">Modo</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {config?.mode === "BOT" ? "VS Bot" : "2 Jugadores"}
                                </Typography>
                            </CardContent>
                        </Card>

                        {config?.mode === "BOT" && (
                            <Card className={styles.cardStatic}>
                                <CardContent className={styles.cardContent} sx={{ textAlign: "center" }}>
                                    <Typography variant="subtitle2" color="primary">Dificultad</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {difficultyLabels[config.difficulty]}
                                    </Typography>
                                </CardContent>
                            </Card>
                        )}
                    </Stack>

                    <Button
                        variant="outlined"
                        onClick={actions.newGame}
                        className={styles.restartButton}
                        sx={{ mt: 'auto' }}
                    >
                        🎮 Reiniciar partida
                    </Button>
                </Box>

                <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: { xs: 2, md: 4 } }}>
                    <Typography variant="h3" className={styles.gameTitle} sx={{ mb: 2 }}>
                        ¡Tu partida de Y!
                    </Typography>

                    {error && <Paper sx={{ p: 2, my: 1, width: { xs: "100%", md: "80%" }, textAlign: "center", borderColor: "error.main", color: "error.main" }}>{error}</Paper>}

                    {loading && <Paper sx={{ p: 2, my: 1, width: { xs: "100%", md: "80%" }, textAlign: "center" }}>Bot pensando...</Paper>}

                    <Paper sx={{ mt: 3, padding: { xs: "8px", sm: "12px", md: "16px" }, display: "inline-flex", justifyContent: "center", alignItems: "center", width: "fit-content", maxWidth: "100%", overflow: "visible" }}>
                        <Board layout={gameState.layout} size={gameState.size} onCellClick={actions.handleCellClick} currentPlayer={gameState.turn} />
                    </Paper>

                    {gameOver && (
                        <Typography variant="h4" className={styles.gameOver} sx={{ mt: 3, textAlign: "center" }}>
                            ¡Partida terminada!
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    );
}