import { useLocation } from "react-router-dom";
import { Board } from "./Board.tsx";
import { useGameController } from "../../hooks/useGameController.ts";
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
import fondo from "../../images/fondo.jpg";
import styles from "../css/GameUI.module.css";
import type {YenPositionDto} from "../../../../shared/contracts";

export default function GameUI() {
    const location = useLocation();
    const config = location.state as {
        boardSize: number;
        strategy: string;
        difficulty: string;
        mode: "BOT" | "LOCAL_2P";
        initialYEN?: YenPositionDto;
    } | null;

    const { state, actions } = useGameController(config?.boardSize, config?.mode, config?.initialYEN);
    const { gameState, loading, error, gameOver } = state;
    const playerColors = ["#00fff7", "#ff00d4"]; // neon colors

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
                overflow: "auto",
                backgroundImage: `url(${fondo})`,
            }}
        >
            <Box
                className={styles.mainBox}
                sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, width: "100%", maxWidth: 1200,
                    minHeight: "80vh" }}
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
                                    <Typography variant="subtitle1" color="#fff">Turno</Typography>
                                    <Typography variant="body2" color="#fff">
                                        {gameState.turn === 0 ? "Jugador 1" : config?.mode === "BOT" ? "Bot"
                                            : "Jugador 2"}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>

                        <Card className={styles.cardStatic} sx={{ boxShadow: "0 0 8px #00fff7",
                            border: "1px solid #00fff7" }}>
                            <CardContent className={styles.cardContent} sx={{ textAlign: "center" }}>
                                <Typography variant="subtitle2" color="#fff">Modo</Typography>
                                <Typography variant="body2" color="#fff">{config?.mode === "BOT" ? "VS Bot"
                                    : "2 Jugadores"}</Typography>
                            </CardContent>
                        </Card>
                    </Stack>

                    <Button onClick={actions.newGame} sx={{ bgcolor: "#00fff7", color: "#000", "&:hover": {
                        bgcolor: "#00d9d9" }, boxShadow: "0 0 15px #00fff7" }} className={styles.restartButton}>
                        🎮 Reiniciar partida
                    </Button>
                </Box>

                <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", p: { xs: 2, md: 4 } }}>
                    <Typography variant="h3" sx={{ color: "#fff", textShadow: "0 0 5px #00fff7, 0 0 10px #ff00d4" }}
                                className={styles.gameTitle}>
                        ¡Tu partida de Y!
                    </Typography>

                    {error && <Paper sx={{ bgcolor: "rgba(255,0,0,0.7)", p: 2, borderRadius: 4, my: 1, width: {
                        xs: "100%", md: "80%" }, textAlign: "center", color: "#fff" }}>{error}</Paper>}

                    {loading && <Paper sx={{ bgcolor: "rgba(0,255,255,0.3)", p: 2, borderRadius: 4, my: 1, width: {
                        xs: "100%", md: "80%" }, textAlign: "center", color: "#000" }}>Bot pensando...</Paper>}

                    <Paper sx={{ mt: 3, padding: {
                        xs: "8px", sm: "12px", md: "16px" }, borderRadius: 4, bgcolor: "rgba(0,0,0,0.7)",
                        boxShadow: "0 0 10px #00fff7", display: "inline-flex", justifyContent: "center",
                        alignItems: "center", width: "fit-content", maxWidth: "100%", overflow: "visible" }}>
                        <Board layout={gameState.layout} size={gameState.size} onCellClick={actions.handleCellClick}
                               currentPlayer={gameState.turn} />
                    </Paper>

                    {gameOver && <Typography variant="h4" sx={{ mt: 3, fontWeight: "bold", color: "#fff",
                        textShadow: "0 0 10px #00fff7, 0 0 15px #ff00d4", textAlign: "center" }}
                                             className={styles.gameOver}>¡Partida terminada!</Typography>}
                </Box>
            </Box>
        </Box>
    );
}