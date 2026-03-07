import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterForm from '../features/auth/ui/RegisterForm.tsx';
import { AuthProvider } from '../features/auth/context/AuthContext.tsx';
import { afterEach, describe, expect, test, vi } from 'vitest';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe('RegisterForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  test('shows validation error when username is empty', async () => {
    renderWithProviders(<RegisterForm />);
    fireEvent.click(screen.getByRole('button', { name: /let's go!/i }));

    expect(screen.getByText(/please enter a username/i)).toBeInTheDocument();
  });

  test('shows validation error when password is too short', async () => {
    renderWithProviders(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Pablo' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /let's go!/i }));

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  test('submits and displays success response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: 'fake-token',
        refreshToken: 'fake-refresh',
        user: { id: 1, username: 'Pablo' },
      }),
    } as Response);

    renderWithProviders(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Pablo' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /let's go!/i }));

    expect(await screen.findByText(/hello pablo! welcome to yovi!/i)).toBeInTheDocument();
  });

  test('shows API error message on non-ok responses', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ message: 'Username already exists' }),
    } as Response);

    renderWithProviders(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Pablo' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /let's go!/i }));

    expect(await screen.findByText('Username already exists')).toBeInTheDocument();
  });

  test('shows network error when fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network down'));

    renderWithProviders(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Pablo' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /let's go!/i }));

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });
});
