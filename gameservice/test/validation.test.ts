import { describe, it, expect } from 'vitest';
import {
    validateCreateMatch,
    validateAddMove,
    validateUserId,
    validateMatchId,
    validateFinishMatch,
} from '../src/validation/game.schemas';

describe('Game validation schemas', () => {
    describe('validateCreateMatch', () => {
        it('should validate correct create match data', () => {
            const result = validateCreateMatch({
                boardSize: 8,
                difficulty: 'medium',
                mode: 'BOT',
                rules: {
                    pieRule: { enabled: false },
                    honey: { enabled: false, blockedCells: [] },
                },
            });

            expect(result).toEqual({
                boardSize: 8,
                difficulty: 'medium',
                mode: 'BOT',
                rules: {
                    pieRule: { enabled: false },
                    honey: { enabled: false, blockedCells: [] },
                },
            });
        });

        it('should accept all difficulty levels in lowercase', () => {
            const difficulties = ['easy', 'medium', 'hard'];

            for (const difficulty of difficulties) {
                const result = validateCreateMatch({
                    boardSize: 8,
                    difficulty,
                });
                expect(result.difficulty).toBe(difficulty);
            }
        });

        it('should normalize difficulty to lowercase', () => {
            const result = validateCreateMatch({
                boardSize: 8,
                difficulty: 'MEDIUM',
            });

            expect(result.difficulty).toBe('medium');
        });

        it('should accept mixed case difficulty', () => {
            const result = validateCreateMatch({
                boardSize: 8,
                difficulty: 'EaSy',
            });

            expect(result.difficulty).toBe('easy');
        });

        it('should reject non-object input', () => {
            expect(() => validateCreateMatch('invalid')).toThrow();
            expect(() => validateCreateMatch(null)).toThrow();
            expect(() => validateCreateMatch(123)).toThrow();
        });

        it('should reject non-positive boardSize', () => {
            expect(() =>
                validateCreateMatch({
                    boardSize: 0,
                    difficulty: 'medium',
                })
            ).toThrow();

            expect(() =>
                validateCreateMatch({
                    boardSize: -5,
                    difficulty: 'medium',
                })
            ).toThrow();
        });

        it('should reject invalid difficulty', () => {
            expect(() =>
                validateCreateMatch({
                    boardSize: 8,
                    difficulty: 'extreme',
                })
            ).toThrow();
        });

        it('should reject non-numeric boardSize', () => {
            expect(() =>
                validateCreateMatch({
                    boardSize: 'eight',
                    difficulty: 'medium',
                })
            ).toThrow();
        });

        it('should reject missing difficulty', () => {
            expect(() =>
                validateCreateMatch({
                    boardSize: 8,
                })
            ).toThrow();
        });

        it('should default mode to BOT when not provided', () => {
            const result = validateCreateMatch({ boardSize: 8, difficulty: 'easy' });
            expect(result.mode).toBe('BOT');
            expect(result.rules).toEqual({
                pieRule: { enabled: false },
                honey: { enabled: false, blockedCells: [] },
            });
        });

        it('should accept pie-rule only', () => {
            const result = validateCreateMatch({
                boardSize: 8,
                difficulty: 'easy',
                rules: {
                    pieRule: { enabled: true },
                    honey: { enabled: false, blockedCells: [] },
                },
            });
            expect(result.rules).toEqual({
                pieRule: { enabled: true },
                honey: { enabled: false, blockedCells: [] },
            });
        });

        it('should accept honey-only without blocked cells (generated server-side)', () => {
            const result = validateCreateMatch({
                boardSize: 8,
                difficulty: 'easy',
                rules: {
                    pieRule: { enabled: false },
                    honey: { enabled: true, blockedCells: [] },
                },
            });
            expect(result.rules).toEqual({
                pieRule: { enabled: false },
                honey: { enabled: true, blockedCells: [] },
            });
        });

        it('should accept both extras enabled', () => {
            const result = validateCreateMatch({
                boardSize: 8,
                difficulty: 'easy',
                rules: {
                    pieRule: { enabled: true },
                    honey: { enabled: true, blockedCells: [] },
                },
            });
            expect(result.rules).toEqual({
                pieRule: { enabled: true },
                honey: { enabled: true, blockedCells: [] },
            });
        });

        it('should reject blocked cells when honey is disabled', () => {
            expect(() =>
                validateCreateMatch({
                    boardSize: 8,
                    difficulty: 'easy',
                    rules: {
                        pieRule: { enabled: false },
                        honey: { enabled: false, blockedCells: [{ row: 0, col: 0 }] },
                    },
                })
            ).toThrow('rules.honey.blockedCells is generated automatically and cannot be configured manually');
        });

        it('should reject manually configured blocked cell coordinates', () => {
            expect(() =>
                validateCreateMatch({
                    boardSize: 8,
                    difficulty: 'easy',
                    rules: {
                        pieRule: { enabled: false },
                        honey: { enabled: true, blockedCells: [{ row: 1, col: 0 }] },
                    },
                })
            ).toThrow('rules.honey.blockedCells is generated automatically and cannot be configured manually');
        });

        it('should accept all valid modes', () => {
            for (const mode of ['BOT', 'ONLINE', 'LOCAL_2P']) {
                const result = validateCreateMatch({ boardSize: 8, difficulty: 'easy', mode });
                expect(result.mode).toBe(mode);
            }
        });

        it('should normalize mode to uppercase', () => {
            const result = validateCreateMatch({ boardSize: 8, difficulty: 'easy', mode: 'bot' });
            expect(result.mode).toBe('BOT');
        });

        it('should reject an invalid mode', () => {
            expect(() =>
                validateCreateMatch({ boardSize: 8, difficulty: 'easy', mode: 'RANKED' })
            ).toThrow('mode must be BOT, ONLINE or LOCAL_2P');
        });

        it('should reject a non-string mode', () => {
            expect(() =>
                validateCreateMatch({ boardSize: 8, difficulty: 'easy', mode: 123 })
            ).toThrow();
        });
    });

    describe('validateAddMove', () => {
        it('should validate correct move data', () => {
            const valid = {
                position_yen: 'a1',
                player: 'USER',
                moveNumber: 1,
            };

            const result = validateAddMove(valid);

            expect(result).toEqual(valid);
        });

        it('should accept BOT as player', () => {
            const result = validateAddMove({
                position_yen: 'h8',
                player: 'BOT',
                moveNumber: 2,
            });

            expect(result.player).toBe('BOT');
        });

        it('should accept various positions', () => {
            const positions = ['a1', 'h8', 'e4', 'd5'];

            for (const position of positions) {
                const result = validateAddMove({
                    position_yen: position,
                    player: 'USER',
                    moveNumber: 1,
                });
                expect(result.position_yen).toBe(position);
            }
        });

        it('should reject non-object input', () => {
            expect(() => validateAddMove('invalid')).toThrow();
            expect(() => validateAddMove(null)).toThrow();
        });

        it('should reject empty position_yen', () => {
            expect(() =>
                validateAddMove({
                    position_yen: '',
                    player: 'USER',
                    moveNumber: 1,
                })
            ).toThrow();

            expect(() =>
                validateAddMove({
                    position_yen: '   ',
                    player: 'USER',
                    moveNumber: 1,
                })
            ).toThrow();
        });

        it('should reject invalid player', () => {
            expect(() =>
                validateAddMove({
                    position_yen: 'a1',
                    player: 'PLAYER',
                    moveNumber: 1,
                })
            ).toThrow();
        });

        it('should reject non-positive moveNumber', () => {
            expect(() =>
                validateAddMove({
                    position_yen: 'a1',
                    player: 'USER',
                    moveNumber: 0,
                })
            ).toThrow();

            expect(() =>
                validateAddMove({
                    position_yen: 'a1',
                    player: 'USER',
                    moveNumber: -1,
                })
            ).toThrow();
        });

        it('should reject non-numeric moveNumber', () => {
            expect(() =>
                validateAddMove({
                    position_yen: 'a1',
                    player: 'USER',
                    moveNumber: 'one',
                })
            ).toThrow();
        });
    });

    describe('validateUserId', () => {
        it('should validate positive userId', () => {
            expect(validateUserId(1)).toBe(1);
            expect(validateUserId(100)).toBe(100);
            expect(validateUserId('42')).toBe(42);
        });

        it('should reject zero', () => {
            expect(() => validateUserId(0)).toThrow();
        });

        it('should reject negative numbers', () => {
            expect(() => validateUserId(-1)).toThrow();
            expect(() => validateUserId('-5')).toThrow();
        });

        it('should reject non-numeric values', () => {
            expect(() => validateUserId('abc')).toThrow();
            expect(() => validateUserId(null)).toThrow();
            expect(() => validateUserId(undefined)).toThrow();
        });

        it('should reject NaN', () => {
            expect(() => validateUserId(NaN)).toThrow();
        });
    });

    describe('validateMatchId', () => {
        it('should validate positive matchId', () => {
            expect(validateMatchId(1)).toBe(1);
            expect(validateMatchId(999)).toBe(999);
            expect(validateMatchId('42')).toBe(42);
        });

        it('should reject zero', () => {
            expect(() => validateMatchId(0)).toThrow();
        });

        it('should reject negative numbers', () => {
            expect(() => validateMatchId(-1)).toThrow();
            expect(() => validateMatchId('-10')).toThrow();
        });

        it('should reject non-numeric values', () => {
            expect(() => validateMatchId('xyz')).toThrow();
            expect(() => validateMatchId(null)).toThrow();
            expect(() => validateMatchId(undefined)).toThrow();
        });

        it('should reject NaN', () => {
            expect(() => validateMatchId(NaN)).toThrow();
        });
    });

    describe('validateFinishMatch', () => {
        it('should accept USER as winner', () => {
            expect(validateFinishMatch({ winner: 'USER' })).toEqual({ winner: 'USER' });
        });

        it('should accept BOT as winner', () => {
            expect(validateFinishMatch({ winner: 'BOT' })).toEqual({ winner: 'BOT' });
        });

        it('should reject invalid winner', () => {
            expect(() => validateFinishMatch({ winner: 'DRAW' })).toThrow();
            expect(() => validateFinishMatch({ winner: 'invalid' })).toThrow();
            expect(() => validateFinishMatch({ winner: '' })).toThrow();
        });

        it('should reject missing body', () => {
            expect(() => validateFinishMatch(null)).toThrow();
            expect(() => validateFinishMatch(undefined)).toThrow();
        });
    });
});