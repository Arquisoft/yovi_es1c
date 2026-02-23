import { Box, Button } from "@mui/material";

interface BoardProps {
    layout: string;
    size: number;
    onCellClick: (row: number, col: number) => void;
    currentPlayer: number;
    isDark: boolean;
}

export function Board({
                          layout,
                          size,
                          onCellClick,
                          currentPlayer,
                          isDark,
                      }: BoardProps) {
    const rows = layout.split("/");

    const getCellSymbol = (rowIndex: number, colIndex: number) => {
        return rows[rowIndex]?.[colIndex] ?? ".";
    };

    const playerColors = ["#4fc3f7", "#f44336"];

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                width: "100%",
            }}
        >
            {Array.from({ length: size }, (_, rowIndex) => {
                const numCells = rowIndex + 1;

                return (
                    <Box
                        key={rowIndex}
                        sx={{
                            display: "flex",
                            justifyContent: "center",
                            gap: 1,
                        }}
                    >
                        {Array.from({ length: numCells }, (_, colIndex) => {
                            const symbol = getCellSymbol(rowIndex, colIndex);
                            const isEmpty = symbol === ".";

                            return (
                                <Button
                                    key={colIndex}
                                    onClick={() => isEmpty && onCellClick(rowIndex, colIndex)}
                                    disabled={!isEmpty}
                                    sx={{
                                        minWidth: 40,
                                        minHeight: 40,
                                        borderRadius: "50%",
                                        bgcolor: isEmpty
                                            ? isDark
                                                ? "#455a64"
                                                : "#e0f7fa"
                                            : symbol === "B"
                                                ? playerColors[0]
                                                : playerColors[1],
                                        color: "#fff",
                                        fontWeight: "bold",
                                        transition: "all 0.2s ease",
                                        "&:hover": {
                                            bgcolor: isEmpty
                                                ? currentPlayer === 0
                                                    ? playerColors[0] + "aa"
                                                    : playerColors[1] + "aa"
                                                : undefined,
                                            transform: isEmpty ? "scale(1.1)" : undefined,
                                        },
                                    }}
                                >
                                    {symbol !== "." ? symbol : ""}
                                </Button>
                            );
                        })}
                    </Box>
                );
            })}
        </Box>
    );
}