import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import i18n from '../i18n';
import { renderWithProviders } from './test-utils';
import LeaderboardUI from '../features/ranking/ui/LeaderboardUI';
import * as rankingControllerModule from '../features/ranking/hooks/useRankingController';
import * as authModule from '../features/auth';

vi.mock('../features/ranking/hooks/useRankingController');
vi.mock('../features/auth', async () => {
    const actual = await vi.importActual<typeof authModule>('../features/auth');
    return { ...actual, useAuth: vi.fn() };
});

describe('LeaderboardUI', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await i18n.changeLanguage('es');
        vi.mocked(authModule.useAuth).mockReturnValue({
            user: { id: 1, username: 'alice' },
        } as any);
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('shows loading indicator while the ranking is being fetched', () => {
        vi.mocked(rankingControllerModule.useRankingController).mockReturnValue({
            state: { leaderboard: null, userRanking: null, loading: true, error: null },
            actions: { refresh: vi.fn() },
        } as any);

        renderWithProviders(<LeaderboardUI />);

        expect(screen.getByText(i18n.t('ranking.loading'))).toBeInTheDocument();
    });

    it('shows the error message when the fetch fails', () => {
        vi.mocked(rankingControllerModule.useRankingController).mockReturnValue({
            state: { leaderboard: null, userRanking: null, loading: false, error: 'Error 500' },
            actions: { refresh: vi.fn() },
        } as any);

        renderWithProviders(<LeaderboardUI />);

        expect(screen.getByText(/Error 500/)).toBeInTheDocument();
    });

    it('renders nothing when there is no leaderboard and no error', () => {
        vi.mocked(rankingControllerModule.useRankingController).mockReturnValue({
            state: { leaderboard: null, userRanking: null, loading: false, error: null },
            actions: { refresh: vi.fn() },
        } as any);

        const { container } = renderWithProviders(<LeaderboardUI />);
        expect(container.firstChild).toBeNull();
    });

    it('renders the empty-state message when the leaderboard has no entries', () => {
        vi.mocked(rankingControllerModule.useRankingController).mockReturnValue({
            state: {
                leaderboard: { total: 0, limit: 20, offset: 0, entries: [] },
                userRanking: null,
                loading: false,
                error: null,
            },
            actions: { refresh: vi.fn() },
        } as any);

        renderWithProviders(<LeaderboardUI />);

        expect(screen.getByText(i18n.t('ranking.empty'))).toBeInTheDocument();
        expect(screen.getByText(i18n.t('ranking.topPlayers'))).toBeInTheDocument();
    });

    it('renders localized stat cards and the data grid when entries are present', () => {
        vi.mocked(rankingControllerModule.useRankingController).mockReturnValue({
            state: {
                leaderboard: {
                    total: 2,
                    limit: 20,
                    offset: 0,
                    entries: [
                        { rank: 1, userId: 1, username: 'alice', eloRating: 1600, gamesPlayed: 12, peakRating: 1650, lastUpdated: '2026-04-01T00:00:00Z' },
                        { rank: 2, userId: 7, username: null, eloRating: 1450, gamesPlayed: 5, peakRating: 1460, lastUpdated: 'not-a-date' },
                    ],
                },
                userRanking: { rank: 1, userId: 1, username: 'alice', eloRating: 1600, gamesPlayed: 12, peakRating: 1650, lastUpdated: '2026-04-01T00:00:00Z' },
                loading: false,
                error: null,
            },
            actions: { refresh: vi.fn() },
        } as any);

        renderWithProviders(<LeaderboardUI />);

        expect(screen.getByText(i18n.t('ranking.title'))).toBeInTheDocument();
        expect(screen.getByText(i18n.t('ranking.subtitle'))).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: i18n.t('ranking.columns.player') })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: i18n.t('ranking.columns.updatedAt') })).toBeInTheDocument();
        expect(screen.getByText(i18n.t('ranking.stats.players'))).toBeInTheDocument();
        expect(screen.getByText('alice')).toBeInTheDocument();
        expect(screen.getByText('#7')).toBeInTheDocument();
        expect(screen.getByText(i18n.t('nA'))).toBeInTheDocument();
    });

    it('falls back to dashes when the user has no ranking row', () => {
        vi.mocked(rankingControllerModule.useRankingController).mockReturnValue({
            state: {
                leaderboard: { total: 1, limit: 20, offset: 0, entries: [] },
                userRanking: null,
                loading: false,
                error: null,
            },
            actions: { refresh: vi.fn() },
        } as any);

        renderWithProviders(<LeaderboardUI />);

        const dashes = screen.getAllByText('—');
        expect(dashes.length).toBeGreaterThanOrEqual(3);
    });

    it('passes the auth user id to the ranking controller', () => {
        const spy = vi.mocked(rankingControllerModule.useRankingController).mockReturnValue({
            state: { leaderboard: null, userRanking: null, loading: true, error: null },
            actions: { refresh: vi.fn() },
        } as any);

        renderWithProviders(<LeaderboardUI />);

        expect(spy).toHaveBeenCalledWith({ userId: 1 });
    });

    it('falls back to a null userId when the user is not authenticated', () => {
        vi.mocked(authModule.useAuth).mockReturnValue({ user: null } as any);
        const spy = vi.mocked(rankingControllerModule.useRankingController).mockReturnValue({
            state: { leaderboard: null, userRanking: null, loading: true, error: null },
            actions: { refresh: vi.fn() },
        } as any);

        renderWithProviders(<LeaderboardUI />);

        expect(spy).toHaveBeenCalledWith({ userId: null });
    });
});