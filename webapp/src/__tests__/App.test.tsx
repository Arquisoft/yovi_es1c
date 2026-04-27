import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../app/App';

vi.mock('../components/layout/Nav', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

    return {
        default: () => (
            <nav>
                <actual.Link to="/">Home</actual.Link>
                <actual.Link to="/gamey">Play</actual.Link>
                <actual.Link to="/stats">Stats</actual.Link>
                <actual.Link to="/messages">Messages</actual.Link>
            </nav>
        ),
    };
});

vi.mock('../features/auth/ui/LoginForm.tsx', () => ({
    default: () => <div>LoginForm Mock</div>,
}));

vi.mock('../features/auth/ui/RegisterForm.tsx', () => ({
    default: () => <div>RegisterForm Mock</div>,
}));

vi.mock('../features/game/ui/tsx/GameUI.tsx', () => ({
    default: () => <div>GameUI Mock</div>,
}));

vi.mock('../features/messages', () => ({
    MessagesPage: () => <div>MessagesPage Mock</div>,
}));

vi.mock('../features/game/ui/tsx/CreateMatchPage.tsx', () => ({
    default: () => <div>CreateMatchPage Mock</div>,
}));

vi.mock('../features/game/ui/tsx/OnlineMatchmakingPage.tsx', () => ({
    default: () => <div>OnlineMatchmakingPage Mock</div>,
}));

vi.mock('../features/ranking/ui/LeaderboardUI.tsx', () => ({
    default: () => <div>LeaderboardUI Mock</div>,
}));

vi.mock('../features/profile', () => ({
    ProfilePage: () => <div>ProfilePage Mock</div>,
}));

vi.mock('../features/friends', () => ({
    FriendsPage: () => <div>FriendsPage Mock</div>,
}));

vi.mock('../features/stats/hooks/useStatsController', () => ({
    useStatsController: () => ({
        state: {
            stats: { totalMatches: 0, wins: 0, losses: 0, matches: [] },
            loading: false,
            error: null,
        },
        refresh: vi.fn(),
    }),
}));

vi.mock('../features/game/hooks/useFriendMatchInvites', () => ({
    useFriendMatchInvites: () => ({
        pendingFriendInvite: null,
        outgoingFriendInvite: null,
        readyFriendMatch: null,
        notice: null,
        errorKey: null,
        acceptPendingFriendInvite: vi.fn(),
        declinePendingFriendInvite: vi.fn(),
        cancelOutgoingFriendInvite: vi.fn(),
        clearReadyFriendMatch: vi.fn(),
        clearFriendMatchNotice: vi.fn(),
    }),
}));

describe('App Routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

describe('App', () => {
    it('redirects to /login when not authenticated', () => {
        localStorage.clear();
        render(<App />);

        expect(screen.getByText('LoginForm Mock')).toBeInTheDocument();
    });

    it('navigates to /gamey when clicking Play', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('link', { name: 'Play' }));

        await waitFor(() => {
            expect(screen.getByText('GameUI Mock')).toBeInTheDocument();
        });
    });

    it('navigates to /stats when clicking Stats', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('link', { name: 'Stats' }));

        await waitFor(() => {
            expect(screen.getByText(/estadísticas del jugador/i)).toBeInTheDocument();
                expect(screen.getByText(/Partidas jugadas/i)).toBeInTheDocument();
            expect(screen.getByText(/Victorias/i)).toBeInTheDocument();
            expect(screen.getByText(/Derrotas/i)).toBeInTheDocument();
        });
    });

    it('navigates to /messages when clicking Messages', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('link', { name: 'Messages' }));

        await waitFor(() => {
            expect(screen.getByText('MessagesPage Mock')).toBeInTheDocument();
        });
    });

    it('navigates back to Home when clicking Home', async () => {
        localStorage.clear();
        render(<App />);
        fireEvent.click(screen.getByRole('link', { name: 'Play' }));
        await waitFor(() => screen.getByText('GameUI Mock'));

        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        await waitFor(() => {
            expect(screen.getByText('LoginForm Mock')).toBeInTheDocument();
        });
    });

})});