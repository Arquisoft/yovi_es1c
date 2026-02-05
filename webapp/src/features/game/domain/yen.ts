import type { YenPositionDto } from "../../../shared/contracts";

export const createEmptyYEN = (size: number): YenPositionDto => {
    const layout = Array.from({ length: size }, (_, rowIndex) =>
        ".".repeat(rowIndex + 1)
    ).join("/");

    return {
        size,
        turn: 0,
        players: ["B", "R"],
        layout,
    };
};

export const updateLayout = (
    currentLayout: string,
    row: number,
    col: number,
    playerSymbol: string
): string => {
    const rows = currentLayout.split("/");
    const rowChars = rows[row].split("");
    rowChars[col] = playerSymbol;
    rows[row] = rowChars.join("");
    return rows.join("/");
};

export const getCellSymbol = (layout: string, row: number, col: number): string => {
    const rows = layout.split("/");
    return rows[row]?.[col] ?? ".";
};

export const coordsFromRowCol = (row: number, col: number, size: number) => {
    const x = size - 1 - row;
    const y = col;
    const z = row - col;
    return { x, y, z };
};

export const rowColFromCoords = (
    coords: { x: number; y: number; z: number },
    size: number
): { row: number; col: number } | null => {
    const row = size - 1 - coords.x;
    const col = coords.y;
    if (row < 0 || row >= size) return null;
    if (col < 0 || col > row) return null;
    if (row - col !== coords.z) return null;
    return { row, col };
};

export const checkWinner = (
    layout: string,
    size: number,
    symbol: string
): boolean => {
    const visited = new Set<string>();
    const rows = layout.split("/");

    const hasSymbol = (row: number, col: number) =>
        rows[row]?.[col] === symbol;

    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col <= row; col += 1) {
            if (!hasSymbol(row, col)) continue;
            const key = `${row}-${col}`;
            if (visited.has(key)) continue;

            let touchesA = false;
            let touchesB = false;
            let touchesC = false;
            const queue: Array<{ row: number; col: number }> = [{ row, col }];
            visited.add(key);

            while (queue.length > 0) {
                const current = queue.shift();
                if (!current) break;
                const coords = coordsFromRowCol(current.row, current.col, size);

                if (coords.x === 0) touchesA = true;
                if (coords.y === 0) touchesB = true;
                if (coords.z === 0) touchesC = true;

                if (touchesA && touchesB && touchesC) {
                    return true;
                }

                const neighbors = [
                    { x: coords.x - 1, y: coords.y + 1, z: coords.z },
                    { x: coords.x - 1, y: coords.y, z: coords.z + 1 },
                    { x: coords.x + 1, y: coords.y - 1, z: coords.z },
                    { x: coords.x, y: coords.y - 1, z: coords.z + 1 },
                    { x: coords.x + 1, y: coords.y, z: coords.z - 1 },
                    { x: coords.x, y: coords.y + 1, z: coords.z - 1 },
                ];

                for (const neighbor of neighbors) {
                    if (neighbor.x < 0 || neighbor.y < 0 || neighbor.z < 0) continue;
                    if (neighbor.x + neighbor.y + neighbor.z !== size - 1) continue;
                    const next = rowColFromCoords(neighbor, size);
                    if (!next) continue;
                    const nextKey = `${next.row}-${next.col}`;
                    if (visited.has(nextKey)) continue;
                    if (!hasSymbol(next.row, next.col)) continue;
                    visited.add(nextKey);
                    queue.push(next);
                }
            }
        }
    }

    return false;
};
