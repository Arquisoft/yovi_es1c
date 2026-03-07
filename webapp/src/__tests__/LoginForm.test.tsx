import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginForm from '../features/auth/ui/LoginForm.tsx';
import { AuthProvider } from '../features/auth/context/AuthContext.tsx';
import { afterEach, describe, expect, test, vi } from 'vitest';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  test('shows validation error when username is empty', () => {
    renderWithProviders(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(screen.getByText(/please enter a username/i)).toBeInTheDocument();
  });

  test('shows validation error when password is empty', () => {
    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Pablo' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(screen.getByText(/please enter a password/i)).toBeInTheDocument();
  });

  test('calls fetch and logs in on success', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: 'fake-token',
        refreshToken: 'fake-refresh',
        user: { id: 1, username: 'Pablo' },
      }),
    } as Response);

    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Pablo' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  test('shows API error message on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    } as Response);

    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Pablo' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  test('shows network error when fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network down'));

    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Pablo' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });
});
