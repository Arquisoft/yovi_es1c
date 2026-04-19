import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../app/App';
import { fetchWithAuth } from '../shared/api/fetchWithAuth';

const activeSessionMock = vi.fn();

vi.mock('../components/layout/Nav', () => ({
  default: () => <nav>nav</nav>,
}));

vi.mock('../features/auth/ui/LoginForm.tsx', () => ({ default: () => <div>Login</div> }));
vi.mock('../features/auth/ui/RegisterForm.tsx', () => ({ default: () => <div>Register</div> }));
vi.mock('../features/game/ui/tsx/GameUI.tsx', () => ({ default: () => <div>Game</div> }));
vi.mock('../features/game/ui/tsx/CreateMatchPage.tsx', () => ({ default: () => <div>Create Match</div> }));
vi.mock('../features/game/ui/tsx/OnlineMatchmakingPage.tsx', () => ({ default: () => <div>Matchmaking</div> }));
vi.mock('../features/stats/ui/StatsUI.tsx', () => ({ default: () => <div>Stats</div> }));

vi.mock('../features/game/hooks/useActiveSession', () => ({
  useActiveSession: () => activeSessionMock(),
}));

vi.mock('../shared/api/fetchWithAuth', () => ({
  fetchWithAuth: vi.fn(),
}));

describe('Reconnect banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('auth_token', 'token');
    localStorage.setItem('auth_refresh_token', 'refresh');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'user' }));
    activeSessionMock.mockReturnValue({
      matchId: 'm-active',
      boardSize: 16,
      loading: false,
      error: null,
    });
    vi.mocked(fetchWithAuth).mockResolvedValue(new Response(JSON.stringify({ matchId: 'm-active' }), { status: 200 }));
  });

  it('shows reconnect banner when an active session exists', () => {
    render(<App />);
    expect(screen.getByText('Tienes una partida en curso. ¿Quieres reconectarte?')).toBeInTheDocument();
  });

  it('dismisses banner and calls backend abandon', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Abandonar partida' }));
    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.queryByText('Tienes una partida en curso. ¿Quieres reconectarte?')).not.toBeInTheDocument();
    });
  });

  it('navigates to online game when clicking reconnect', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reconectar' }));

    await waitFor(() => {
      expect(screen.getByText('Game')).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe('/gamey');
    expect(window.history.state.usr).toEqual({
      matchId: 'm-active',
      boardSize: 16,
      mode: 'ONLINE',
      difficulty: 'medium',
    });
  });
});
