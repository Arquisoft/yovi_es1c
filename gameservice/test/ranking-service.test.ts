import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RankingService } from '../src/services/RankingService';
import { RankingRepository } from '../src/repositories/RankingRepository';
import type { PlayerRanking } from '../src/types/ranking';

describe('RankingService', () => {
    let service: RankingService;
    let mockRepo: RankingRepository;

    beforeEach(() => {
        mockRepo = {
            getByUserId: vi.fn(),
            applyRatingChange: vi.fn(),
        } as unknown as RankingRepository;

        service = new RankingService(mockRepo);
    });

    describe('calculateNewRating', () => {
        it('awards more points for a win against a higher-rated opponent', () => {
            const winVsStronger = service.calculateNewRating(1200, 1400, 'WIN', 40);
            const winVsEqual = service.calculateNewRating(1200, 1200, 'WIN', 40);

            expect(winVsStronger).toBeGreaterThan(winVsEqual);
        });

        it('awards fewer points for a win against a lower-rated opponent', () => {
            const winVsWeaker = service.calculateNewRating(1400, 1200, 'WIN', 40);
            const winVsEqual = service.calculateNewRating(1400, 1400, 'WIN', 40);

            expect(winVsWeaker).toBeLessThan(winVsEqual);
        });

        it('losses are symmetric to wins for the opposite side', () => {
            const winnerGain =
                service.calculateNewRating(1200, 1400, 'WIN', 40) - 1200;
            const loserLoss =
                1400 - service.calculateNewRating(1400, 1200, 'LOSS', 40);

            expect(winnerGain).toBe(loserLoss);
        });

        it('returns +20 for a win between equals with K=40', () => {
            expect(service.calculateNewRating(1200, 1200, 'WIN', 40)).toBe(1220);
        });

        it('returns -20 for a loss between equals with K=40', () => {
            expect(service.calculateNewRating(1200, 1200, 'LOSS', 40)).toBe(1180);
        });
    });

    describe('getKFactor', () => {
        it('uses K=40 for players with fewer than 30 games', () => {
            expect(service.getKFactor(0)).toBe(40);
            expect(service.getKFactor(29)).toBe(40);
        });

        it('uses K=20 once the player has played 30 or more games', () => {
            expect(service.getKFactor(30)).toBe(20);
            expect(service.getKFactor(100)).toBe(20);
        });
    });

    describe('getOpponentRatingForBot', () => {
        it('maps each difficulty to its fixed opponent rating', () => {
            expect(service.getOpponentRatingForBot('easy')).toBe(1000);
            expect(service.getOpponentRatingForBot('medium')).toBe(1300);
            expect(service.getOpponentRatingForBot('hard')).toBe(1600);
            expect(service.getOpponentRatingForBot('expert')).toBe(1900);
        });
    });

    describe('getOpponentRatingForUser', () => {
        it('returns the stored elo_rating when the opponent has a ranking row', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue({
                user_id: 7,
                elo_rating: 1450,
                games_played: 12,
                peak_rating: 1500,
                last_updated: '2026-04-01T00:00:00Z',
            });

            await expect(service.getOpponentRatingForUser(7)).resolves.toBe(1450);
        });

        it('falls back to 1200 when the opponent has no ranking row yet', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue(null);

            await expect(service.getOpponentRatingForUser(99)).resolves.toBe(1200);
        });
    });

    describe('applyRatingUpdate', () => {
        const existingRanking: PlayerRanking = {
            user_id: 1,
            elo_rating: 1200,
            games_played: 5,
            peak_rating: 1250,
            last_updated: '2026-04-01T00:00:00Z',
        };

        it('skips LOCAL_2P matches and does not touch the repository', async () => {
            const result = await service.applyRatingUpdate({
                userId: 1,
                matchId: 10,
                mode: 'LOCAL_2P',
                result: 'WIN',
            });

            expect(result).toBeNull();
            expect(mockRepo.getByUserId).not.toHaveBeenCalled();
            expect(mockRepo.applyRatingChange).not.toHaveBeenCalled();
        });

        it('starts new players at rating 1200 when no ranking row exists', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue(null);

            const outcome = await service.applyRatingUpdate({
                userId: 42,
                matchId: 1,
                mode: 'BOT',
                difficulty: 'medium',
                result: 'WIN',
            });

            expect(outcome?.ratingBefore).toBe(1200);
            expect(outcome?.ratingAfter).toBeGreaterThan(1200);
        });

        it('applies BOT rating using the difficulty mapping', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue(existingRanking);

            await service.applyRatingUpdate({
                userId: 1,
                matchId: 10,
                mode: 'BOT',
                difficulty: 'hard',
                result: 'WIN',
            });

            expect(mockRepo.applyRatingChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 1,
                    matchId: 10,
                    ratingBefore: 1200,
                    ratingAfter: expect.any(Number),
                    delta: expect.any(Number),
                    gamesPlayedAfter: 6,
                }),
            );
        });

        it('rewards more when beating a harder bot', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue(existingRanking);

            const easyWin = await service.applyRatingUpdate({
                userId: 1, matchId: 1, mode: 'BOT', difficulty: 'easy', result: 'WIN',
            });
            const expertWin = await service.applyRatingUpdate({
                userId: 1, matchId: 2, mode: 'BOT', difficulty: 'expert', result: 'WIN',
            });

            expect(expertWin!.delta).toBeGreaterThan(easyWin!.delta);
        });

        it('uses the real opponent rating for ONLINE matches', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue(existingRanking);

            const outcome = await service.applyRatingUpdate({
                userId: 1,
                matchId: 20,
                mode: 'ONLINE',
                opponentRating: 1500,
                result: 'WIN',
            });

            expect(outcome?.delta).toBeGreaterThan(0);
            expect(mockRepo.applyRatingChange).toHaveBeenCalledWith(
                expect.objectContaining({ ratingBefore: 1200 }),
            );
        });

        it('updates peak_rating when the new rating exceeds it', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue({
                ...existingRanking,
                elo_rating: 1250,
                peak_rating: 1250,
            });

            await service.applyRatingUpdate({
                userId: 1,
                matchId: 10,
                mode: 'BOT',
                difficulty: 'expert',
                result: 'WIN',
            });

            const call = vi.mocked(mockRepo.applyRatingChange).mock.calls[0][0];
            expect(call.peakRating).toBeGreaterThan(1250);
            expect(call.peakRating).toBe(call.ratingAfter);
        });

        it('keeps peak_rating when the new rating does not exceed it', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue({
                ...existingRanking,
                elo_rating: 1200,
                peak_rating: 1500,
            });

            await service.applyRatingUpdate({
                userId: 1,
                matchId: 10,
                mode: 'BOT',
                difficulty: 'easy',
                result: 'LOSS',
            });

            const call = vi.mocked(mockRepo.applyRatingChange).mock.calls[0][0];
            expect(call.peakRating).toBe(1500);
        });

        it('throws when a BOT match is missing difficulty', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue(existingRanking);

            await expect(
                service.applyRatingUpdate({
                    userId: 1, matchId: 10, mode: 'BOT', result: 'WIN',
                }),
            ).rejects.toThrow(/difficulty/);
        });

        it('throws when an ONLINE match is missing opponentRating', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockResolvedValue(existingRanking);

            await expect(
                service.applyRatingUpdate({
                    userId: 1, matchId: 10, mode: 'ONLINE', result: 'WIN',
                }),
            ).rejects.toThrow(/opponentRating/);
        });

        it('propagates errors from the repository', async () => {
            vi.spyOn(mockRepo, 'getByUserId').mockRejectedValue(new Error('db down'));

            await expect(
                service.applyRatingUpdate({
                    userId: 1, matchId: 10, mode: 'BOT', difficulty: 'medium', result: 'WIN',
                }),
            ).rejects.toThrow('db down');
        });
    });
});
