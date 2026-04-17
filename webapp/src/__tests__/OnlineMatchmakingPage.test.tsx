import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OnlineMatchmakingPage from '../features/game/ui/tsx/OnlineMatchmakingPage';

const navigateMock = vi.fn();
const joinQueueMock = vi.fn();
const cancelQueueMock = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

vi.mock('../features/auth/context/useAuth', () => ({
    useAuth: vi.fn(),
}));

vi.mock('../features/game/hooks/useOnlineMatchmaking', () => ({
    useOnlineMatchmaking: vi.fn(),
}));

import { useAuth } from '../features/auth/context/useAuth';
import { useOnlineMatchmaking } from '../features/game/hooks/useOnlineMatchmaking';

describe('OnlineMatchmakingPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        joinQueueMock.mockResolvedValue(undefined);
        vi.mocked(useOnlineMatchmaking).mockReturnValue({
            waiting: true,
            waitedSec: 5,
            matched: null,
            error: null,
            queueState: 'searching',
            joinQueue: joinQueueMock,
            cancelQueue: cancelQueueMock,
        } as any);
    });

    it('shows login gate when token is missing', () => {
        vi.mocked(useAuth).mockReturnValue({ token: null } as any);

        render(
            <MemoryRouter initialEntries={['/online']}>
                <Routes>
                    <Route path="/online" element={<OnlineMatchmakingPage />} />
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByText('Debes iniciar sesión para jugar online')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ir a Login' }));
        expect(navigateMock).toHaveBeenCalledWith('/login');
    });

    it('joins queue and runs returned cleanup on unmount', async () => {
        vi.mocked(useAuth).mockReturnValue({ token: 'abc' } as any);
        const cleanup = vi.fn();
        joinQueueMock.mockResolvedValue(cleanup);

        const { unmount } = render(
            <MemoryRouter initialEntries={[{ pathname: '/online', state: { boardSize: 10 } }]}>
                <Routes>
                    <Route path="/online" element={<OnlineMatchmakingPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(joinQueueMock).toHaveBeenCalled();
        });

        expect(screen.getByText('Tablero: 10 x 10')).toBeInTheDocument();

        unmount();
        expect(cleanup).toHaveBeenCalled();
    });

    it('navigates to BOT mode when fallback match appears', async () => {
        vi.mocked(useAuth).mockReturnValue({ token: 'abc' } as any);
        vi.mocked(useOnlineMatchmaking).mockReturnValue({
            waiting: false,
            waitedSec: 30,
            matched: { matchId: '__BOT_FALLBACK__', opponent: 'Bot', revealAfterGame: false },
            error: null,
            queueState: 'idle',
            joinQueue: joinQueueMock,
            cancelQueue: cancelQueueMock,
        } as any);

        render(
            <MemoryRouter initialEntries={['/online']}>
                <Routes>
                    <Route path="/online" element={<OnlineMatchmakingPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith('/gamey', {
                state: {
                    boardSize: 8,
                    mode: 'BOT',
                    difficulty: 'medium',
                    rules: {
                        pieRule: { enabled: false },
                        honey: { enabled: false, blockedCells: [] },
                    },
                },
            });
        });
    });

    it('navigates to ONLINE mode when real match is found and can cancel queue', async () => {
        vi.mocked(useAuth).mockReturnValue({ token: 'abc' } as any);
        vi.mocked(useOnlineMatchmaking).mockReturnValue({
            waiting: false,
            waitedSec: 1,
            matched: { matchId: 'online-1', opponent: 'bob', revealAfterGame: false },
            error: 'socket issue',
            queueState: 'searching',
            joinQueue: joinQueueMock,
            cancelQueue: cancelQueueMock,
        } as any);

        render(
            <MemoryRouter initialEntries={['/online']}>
                <Routes>
                    <Route path="/online" element={<OnlineMatchmakingPage />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(navigateMock).toHaveBeenCalledWith('/gamey', expect.objectContaining({
                state: expect.objectContaining({ matchId: 'online-1', mode: 'ONLINE' }),
            }));
        });

        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(cancelQueueMock).toHaveBeenCalled();
        expect(navigateMock).toHaveBeenCalledWith('/create-match');
    });
});