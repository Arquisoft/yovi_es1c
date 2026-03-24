import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatBox from '../features/game/ui/tsx/ChatBox';

describe('ChatBox', () => {
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
      />,
    );

    const input = screen.getByPlaceholderText('Escribe un mensaje');
    fireEvent.change(input, { target: { value: 'nuevo mensaje' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(sendMessage).toHaveBeenCalledWith('nuevo mensaje');
  });

  it('disables input when winner is not null', () => {
    render(
      <ChatBox
        matchId="m1"
        winner="B"
        localUserId={1}
        sendMessage={vi.fn()}
        messages={[]}
      />,
    );

    expect(screen.getByPlaceholderText('Escribe un mensaje')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });
});
