import { describe, expect, it } from 'vitest';
import {
    checkWinner,
    coordsFromRowCol,
    createEmptyYEN,
    getCellSymbol,
    rowColFromCoords,
    updateLayout,
} from '../features/game/domain/yen';

describe('yen domain helpers', () => {
    it('createEmptyYEN builds triangular board', () => {
        expect(createEmptyYEN(3)).toEqual({
            size: 3,
            turn: 0,
            players: ['B', 'R'],
            layout: './../...',
        });
    });

    it('updateLayout and getCellSymbol update requested coordinate', () => {
        const updated = updateLayout('./../...', 2, 1, 'B');
        expect(getCellSymbol(updated, 2, 1)).toBe('B');
        expect(getCellSymbol(updated, 2, 2)).toBe('.');
    });

    it('coordsFromRowCol and rowColFromCoords map both ways', () => {
        const coords = coordsFromRowCol(2, 1, 4);
        expect(coords).toEqual({ x: 1, y: 1, z: 1 });
        expect(rowColFromCoords(coords, 4)).toEqual({ row: 2, col: 1 });
    });

    it('rowColFromCoords rejects invalid coordinates', () => {
        expect(rowColFromCoords({ x: 10, y: 0, z: 0 }, 4)).toBeNull();
        expect(rowColFromCoords({ x: 0, y: -1, z: 0 }, 4)).toBeNull();
        expect(rowColFromCoords({ x: 1, y: 1, z: 5 }, 4)).toBeNull();
    });

    it('checkWinner returns true for a connected component touching three borders', () => {
        const layout = [
            'B',
            'BB',
            '.B.',
        ].join('/');

        expect(checkWinner(layout, 3, 'B')).toBe(true);
    });

    it('checkWinner returns false when no winning path exists', () => {
        const layout = [
            'B',
            '.R',
            'R.B',
        ].join('/');

        expect(checkWinner(layout, 3, 'B')).toBe(false);
    });
});