import { Box, Button } from '@mui/material';
import styles from '../css/Board.module.css';

interface BoardProps {
  layout: string;
  size: number;
  onCellClick: (row: number, col: number) => void;
  currentPlayer: number;
}

export function Board({ layout, size, onCellClick, currentPlayer }: BoardProps) {
  const rows = layout.split('/');
  const playerColors = ['#39ff14', '#90ff5c'];
  const CELL_SIZE = Math.max(16, Math.min(40, Math.floor(600 / size)));

  const getCellSymbol = (rowIndex: number, colIndex: number) => rows[rowIndex]?.[colIndex] ?? '.';

  return (
    <Box className={styles['board-container']}>
      <Box className={styles.board} sx={{ gap: `${CELL_SIZE * 0.15}px` }}>
        {Array.from({ length: size }, (_, rowIndex) => (
          <Box key={rowIndex} className={styles.row} sx={{ gap: `${CELL_SIZE * 0.15}px` }}>
            {Array.from({ length: rowIndex + 1 }, (_, colIndex) => {
              const symbol = getCellSymbol(rowIndex, colIndex);
              const isEmpty = symbol === '.';
              const playerColor = symbol === 'B' ? playerColors[0] : playerColors[1];
              const hoverColor = playerColors[currentPlayer] ?? playerColors[0];

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
                    borderRadius: '50%',
                    bgcolor: isEmpty ? 'rgba(4, 18, 4, 0.92)' : playerColor,
                    border: isEmpty ? '1px solid rgba(57, 255, 20, 0.24)' : '2px solid rgba(225,255,225,0.75)',
                    boxShadow: isEmpty
                      ? 'inset 0 0 10px rgba(0, 0, 0, 0.55)'
                      : `0 0 10px ${playerColor}, 0 0 18px ${playerColor}`,
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
                    '&:hover': isEmpty
                      ? {
                          transform: 'scale(1.12)',
                          bgcolor: 'rgba(12, 40, 12, 0.96)',
                          boxShadow: `0 0 10px ${hoverColor}`,
                        }
                      : undefined,
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
