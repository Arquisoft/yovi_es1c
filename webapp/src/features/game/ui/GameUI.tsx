import { Board } from "./Board";
import { useGameController } from "../hooks/useGameController";
import { useState, useEffect } from 'react';
import styles from './GameUI.module.css';

export default function GameUI() {
    const { state, actions } = useGameController();
    const { gameMode, gameState, loading, error, message, gameOver, isBoardFull } = state;
    const [isDark, setIsDark] = useState(
        window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches);

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    return (
        <div className={styles.gameLayout}>
            <aside className={styles.sidebar}>
                <div className={styles.sidebarSection}>
                    <h3 className={styles.sidebarTitle}>MODO DE JUEGO</h3>

                    <button
                        type="button"
                        onClick={() => actions.selectMode("BOT")}
                        className={`${styles.modeButton} ${gameMode === "BOT" ? styles.active : ''}`}
                    >
                        <span className={styles.modeIcon}>🤖</span>
                        <span>VS Bot</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => actions.selectMode("LOCAL_2P")}
                        className={`${styles.modeButton} ${gameMode === "LOCAL_2P" ? styles.active : ''}`}
                    >
                        <span className={styles.modeIcon}>👥</span>
                        <span>2 Jugadores</span>
                    </button>
                </div>

                <div className={styles.sidebarSection}>
                    <h3 className={styles.sidebarTitle}>TAMAÑO</h3>

                    <button
                        type="button"
                        onClick={() => actions.changeSize(8)}
                        className={`${styles.sizeButton} ${gameState.size === 8 ? styles.active : ''}`}
                    >
                        8x8
                    </button>
                    <button
                        type="button"
                        onClick={() => actions.changeSize(16)}
                        className={`${styles.sizeButton} ${gameState.size === 16 ? styles.active : ''}`}
                    >
                        16x16
                    </button>
                    <button
                        type="button"
                        onClick={() => actions.changeSize(32)}
                        className={`${styles.sizeButton} ${gameState.size === 32 ? styles.active : ''}`}
                    >
                        32x32
                    </button>
                </div>

                <div className={styles.statsSection}>
                    <h3 className={styles.sidebarTitle}>ESTADÍSTICAS</h3>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Modo:</span>
                        <span className={styles.statValue}>
                            {gameMode === "BOT" ? "VS Bot" : "2P"}
                        </span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statLabel}>Estado:</span>
                        <span className={styles.statValue}>
                            {gameOver ? "Finalizado" : "En juego"}
                        </span>
                    </div>
                </div>
            </aside>

            <main className={styles.gameArea}>
                <div className={styles.turnIndicator}>
                    {gameMode === "BOT"
                        ? (gameState.turn === 0 ? "Tu turno" : "Turno del Bot")
                        : (gameState.turn === 0 ? "Jugador 1" : "Jugador 2")}
                </div>

                {message && <p className={styles.message}>{message}</p>}
                {loading && gameMode === "BOT" && <p className={styles.loading}>Bot pensando...</p>}
                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.boardWrapper}>
                    <Board
                        layout={gameState.layout}
                        size={gameState.size}
                        onCellClick={actions.handleCellClick}
                        currentPlayer={gameState.turn}
                        isDark={isDark}
                    />
                </div>

                {isBoardFull && gameOver && (
                    <p className={styles.gameOver}>Partida terminada</p>
                )}
            </main>

            <footer className={styles.footer}>
                <button
                    type="button"
                    onClick={actions.newGame}
                    className={styles.newGameButton}
                >
                    🎮 Nueva Partida
                </button>

                <div className={styles.gameInfo}>
                    <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>JUGADOR ACTUAL</span>
                        <span className={styles.infoValue}>
                            {gameState.turn === 0 ? "Azul" : "Rojo"}
                        </span>
                    </div>
                    <div className={styles.infoItem}>
                        <span className={styles.infoLabel}>TABLERO</span>
                        <span className={styles.infoValue}>
                            {gameState.size}x{gameState.size}
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
