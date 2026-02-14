import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import RegisterForm from '../features/auth/ui/RegisterForm.tsx';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('RegisterForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows validation error when username is empty', async () => {
    render(<RegisterForm />);
    fireEvent.click(screen.getByRole('button', { name: /lets go!/i }));

    expect(screen.getByText(/please enter a username/i)).toBeInTheDocument();
  });

  test('submits username and displays success response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Hello Pablo! Welcome to the course!' }),
    } as Response);

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/whats your name\?/i), { target: { value: 'Pablo' } });
    fireEvent.click(screen.getByRole('button', { name: /lets go!/i }));

    expect(
        await screen.findByText(/hello pablo! welcome to the course!/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/whats your name\?/i)).toHaveValue('');
  });

  test('shows API error message on non-ok responses', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Username already exists' }),
    } as Response);

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/whats your name\?/i), { target: { value: 'Pablo' } });
    fireEvent.click(screen.getByRole('button', { name: /lets go!/i }));

    expect(await screen.findByText('Username already exists')).toBeInTheDocument();
  });

  test('shows network error when fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network down'));

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/whats your name\?/i), { target: { value: 'Pablo' } });
    fireEvent.click(screen.getByRole('button', { name: /lets go!/i }));

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });
});
