import { Board } from "./Board";
import { useGameController } from "../hooks/useGameController";

export default function GameUI() {
    const { state, actions } = useGameController();
    const { gameMode, gameState, loading, error, message, gameOver, isBoardFull } = state;

    return (
        <div style={{ textAlign: "center" }}>
            <h2>Game Y</h2>

            <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginBottom: "16px" }}>
                <button
                    type="button"
                    onClick={() => actions.selectMode("BOT")}
                    style={{
                        padding: "8px 16px",
                        borderRadius: "999px",
                        border: "2px solid #333",
                        backgroundColor: gameMode === "BOT" ? "#333" : "#fff",
                        color: gameMode === "BOT" ? "#fff" : "#333",
                        fontWeight: gameMode === "BOT" ? "bold" : "normal",
                        cursor: "pointer",
                    }}
                >
                    Vs Bot
                </button>

                <button
                    type="button"
                    onClick={() => actions.selectMode("LOCAL_2P")}
                    style={{
                        padding: "8px 16px",
                        borderRadius: "999px",
                        border: "2px solid #333",
                        backgroundColor: gameMode === "LOCAL_2P" ? "#333" : "#fff",
                        color: gameMode === "LOCAL_2P" ? "#fff" : "#333",
                        fontWeight: gameMode === "LOCAL_2P" ? "bold" : "normal",
                        cursor: "pointer",
                    }}
                >
                    2 Jugadores (local)
                </button>
            </div>

            <div style={{ marginBottom: "12px" }}>
                <button
                    type="button"
                    onClick={actions.newGame}
                    style={{
                        padding: "8px 14px",
                        borderRadius: "6px",
                        border: "1px solid #333",
                        cursor: "pointer",
                    }}
                >
                    Nueva partida
                </button>
            </div>

            <p style={{ fontSize: "18px", fontWeight: "bold" }}>{message}</p>

            <p>
                {gameMode === "BOT"
                    ? `Turn: ${gameState.turn === 0 ? "Blue (You)" : "Red (Bot)"}`
                    : `Turno: ${gameState.turn === 0 ? "Jugador 1 (Azul)" : "Jugador 2 (Rojo)"}`}
            </p>

            <Board
                layout={gameState.layout}
                size={gameState.size}
                onCellClick={actions.handleCellClick}
                currentPlayer={gameState.turn}
            />

            {loading && gameMode === "BOT" && <p>Bot thinking...</p>}
            {error && <p style={{ color: "red" }}>{error}</p>}
            {isBoardFull && gameOver && <p style={{ color: "#333" }}>Game over</p>}
        </div>
    );
}
