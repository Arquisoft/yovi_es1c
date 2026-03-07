import { Box, Button } from "@mui/material";
import styles from "../css/Board.module.css";

interface BoardProps {
    layout: string;
    size: number;
    onCellClick: (row: number, col: number) => void;
    currentPlayer: number;
}

export function Board({ layout, size, onCellClick }: BoardProps) {
    const rows = layout.split("/");
    const playerColors = ["#00fff7", "#ff00d4"]; // neon colors
    const CELL_SIZE = Math.max(16, Math.min(40, Math.floor(600 / size)));

    const getCellSymbol = (rowIndex: number, colIndex: number) => {
        return rows[rowIndex]?.[colIndex] ?? ".";
    };

    return (
        <Box className={styles["board-container"]}>
        <Box
            className={styles.board}
            sx={{
                gap: `${CELL_SIZE * 0.15}px`,
            }}
        >
            {Array.from({ length: size }, (_, rowIndex) => (
                <Box
                    key={rowIndex}
                    className={styles.row}
                    sx={{
                        gap: `${CELL_SIZE * 0.15}px`,
                    }}
                >
                    {Array.from({ length: rowIndex + 1 }, (_, colIndex) => {
                        const symbol = getCellSymbol(rowIndex, colIndex);
                        const isEmpty = symbol === ".";
                        const playerColor = symbol === "B" ? playerColors[0] : playerColors[1];

                        return (
                            <Button
                                key={colIndex}
                                onClick={() => isEmpty && onCellClick(rowIndex, colIndex)}
                                disabled={!isEmpty}
                                className={`${styles.cell} ${isEmpty ? styles.empty : styles.occupied}`}
                                sx={{
                                    width: CELL_SIZE,
                                    height: CELL_SIZE,
                                    minWidth: CELL_SIZE,
                                    minHeight: CELL_SIZE,
                                    borderRadius: "50%",
                                    bgcolor: isEmpty ? "rgba(0,0,0,0.3)" : playerColor,
                                    border: isEmpty ? "1px solid rgba(255,255,255,0.2)" : "2px solid #fff",
                                    boxShadow: isEmpty
                                        ? "none"
                                        : `0 0 8px ${playerColor}, 0 0 15px ${playerColor}`,
                                    transition: "all 0.15s ease",
                                    "&:hover": {
                                        transform: isEmpty ? "scale(1.15)" : undefined,
                                    },
                                }}
                            />
                        );
                    })}
                </Box>
            ))}
        </Box>
        </Box>
    );
}