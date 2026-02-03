// webapp/src/Board.tsx
interface BoardProps {
    layout: string;
    size: number;
    onCellClick: (row: number, col: number) => void;
    currentPlayer: number;
}

export function Board({ layout, size, onCellClick, currentPlayer }: BoardProps) {
    const rows = layout.split('/');

    const getCellSymbol = (rowIndex: number, colIndex: number): string => {
        return rows[rowIndex]?.[colIndex] ?? '.';
    };

    const getCellColor = (symbol: string): string => {
        if (symbol === 'B') return '#4169E1';   // Blue
        if (symbol === 'R') return '#DC143C';   // Red
        return '#E0E0E0';                       // Empty
    };

    const getHoverColor = (): string => {
        return currentPlayer === 0 ? '#6495ED' : '#FF6B6B';
    };

    return (
        <div style={{ padding: '20px' }}>
            {Array.from({ length: size }, (_, rowIndex) => {
                const numCells = rowIndex + 1;
                return (
                    <div
                        key={rowIndex}
                        style={{
                            display: 'flex',
                            gap: '8px',
                            marginBottom: '8px',
                            marginLeft: `${(size - numCells) * 25}px`,
                        }}
                    >
                        {Array.from({ length: numCells }, (_, colIndex) => {
                            const symbol = getCellSymbol(rowIndex, colIndex);
                            const isEmpty = symbol === '.';

                            return (
                                <button
                                    key={colIndex}
                                    onClick={() => isEmpty && onCellClick(rowIndex, colIndex)}
                                    disabled={!isEmpty}
                                    style={{
                                        width: '45px',
                                        height: '45px',
                                        borderRadius: '50%',
                                        border: '2px solid #333',
                                        backgroundColor: getCellColor(symbol),
                                        cursor: isEmpty ? 'pointer' : 'not-allowed',
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        color: '#111',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (isEmpty) {
                                            e.currentTarget.style.backgroundColor = getHoverColor();
                                            e.currentTarget.style.transform = 'scale(1.1)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (isEmpty) {
                                            e.currentTarget.style.backgroundColor = getCellColor(symbol);
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }
                                    }}
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
