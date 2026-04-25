import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatBox from '../features/game/ui/tsx/ChatBox';

describe('ChatBox', () => {
  const players = [
  { userId: 1, username: 'alice', avatar: '/avatars/avatar01.png' },
  { userId: 2, username: 'bob', avatar: '/avatars/avatar02.png' },
]

  it('renders messages correctly', () => {
    render(
        <ChatBox
            matchId="m1"
            winner={null}
            localUserId={1}
            sendMessage={vi.fn()}
            messages={[
              { userId: 1, username: 'yo', text: 'hola', timestamp: 1 },
              { userId: 2, username: 'rival', text: 'que tal', timestamp: 2 },
            ]}
            players={players}
        />,
    );

    expect(screen.getByText('hola')).toBeInTheDocument();
    expect(screen.getByText('que tal')).toBeInTheDocument();
    expect(screen.getByText('yo')).toBeInTheDocument();
    expect(screen.getByText('rival')).toBeInTheDocument();
  });

  it('sends message when pressing Enter', () => {
    const sendMessage = vi.fn();

    render(
        <ChatBox
            matchId="m1"
            winner={null}
            localUserId={1}
            sendMessage={sendMessage}
            messages={[]}
            players={players}

        />,
    );

    const input = screen.getByPlaceholderText('Escribe un mensaje');
    fireEvent.change(input, { target: { value: 'nuevo mensaje' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(sendMessage).toHaveBeenCalledWith('nuevo mensaje');
  });

  it('inserts emoji in input and still sends message', () => {
    const sendMessage = vi.fn();
    render(
        <ChatBox
            matchId="m1"
            winner={null}
            localUserId={1}
            sendMessage={sendMessage}
            messages={[]}
            players={players}
        />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Insertar emoji' }));
    fireEvent.click(screen.getByRole('button', { name: '😀' }));

    const input = screen.getByPlaceholderText('Escribe un mensaje') as HTMLInputElement;
    expect(input.value).toBe('😀');

    fireEvent.change(input, { target: { value: '😀 hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(sendMessage).toHaveBeenCalledWith('😀 hola');
  });

  it('disables input when winner is not null', () => {
    render(
        <ChatBox
            matchId="m1"
            winner="B"
            localUserId={1}
            sendMessage={vi.fn()}
            messages={[]}
            players={players}

        />,
    );

    expect(screen.getByPlaceholderText('Escribe un mensaje')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Insertar emoji' })).toBeDisabled();
  });
});
