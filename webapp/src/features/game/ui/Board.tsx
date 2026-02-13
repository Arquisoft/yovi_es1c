import styles from './Board.css';

interface BoardProps {
    layout: string;
    size: number;
    onCellClick: (row: number, col: number) => void;
    currentPlayer: number;
    isDark: boolean;
}

export function Board({ layout, size, onCellClick, currentPlayer, isDark }: BoardProps) {
    const rows = layout.split('/');

    const getCellSymbol = (rowIndex: number, colIndex: number): string => {
        return rows[rowIndex]?.[colIndex] ?? '.';
    };

    const getCellClasses = (symbol: string, isEmpty: boolean): string => {
        const classes = [styles.cell];

        if (isDark) {
            classes.push(styles.darkTheme);
        } else {
            classes.push(styles.lightTheme);
        }

        if (isEmpty) {
            classes.push(styles.empty);
            classes.push(currentPlayer === 0 ? styles.hoverBlue : styles.hoverRed);
        } else if (symbol === 'B') {
            classes.push(styles.blue);
        } else if (symbol === 'R') {
            classes.push(styles.red);
        }

        return classes.join(' ');
    };

    return (
        <div
            className={`${styles.boardContainer} ${isDark ? styles.darkBoard : styles.lightBoard}`}
            data-size={size}
        >
            {Array.from({ length: size }, (_, rowIndex) => {
                const numCells = rowIndex + 1;

                return (
                    <div key={rowIndex} className={styles.row}>
                        {Array.from({ length: numCells }, (_, colIndex) => {
                            const symbol = getCellSymbol(rowIndex, colIndex);
                            const isEmpty = symbol === '.';

                            return (
                                <button
                                    key={colIndex}
                                    onClick={() => isEmpty && onCellClick(rowIndex, colIndex)}
                                    disabled={!isEmpty}
                                    className={getCellClasses(symbol, isEmpty)}
                                    aria-label={`Celda fila ${rowIndex + 1}, columna ${colIndex + 1}`}
                                >
                                    {symbol !== '.' ? symbol : ''}
                                </button>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
