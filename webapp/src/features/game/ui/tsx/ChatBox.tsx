import { useEffect, useRef, useState } from 'react';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import type { ChatMessage } from '../../hooks/useChatSession';

interface ChatBoxProps {
  matchId: string | null;
  winner: 'B' | 'R' | 'DRAW' | null;
  localUserId: number | null;
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
}

export default function ChatBox({ matchId, winner, localUserId, messages, sendMessage }: ChatBoxProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const isDisabled = !matchId || winner !== null;

  const submitMessage = () => {
    const trimmed = text.trim();
    if (!trimmed || isDisabled) return;
    sendMessage(trimmed);
    setText('');
  };

  return (
    <Paper
      sx={{
        mt: 2,
        p: 2,
        width: '100%',
        maxWidth: 560,
        bgcolor: 'rgba(4, 18, 4, 0.88)',
        border: '1px solid rgba(57, 255, 20, 0.22)',
        boxShadow: '0 0 16px rgba(57, 255, 20, 0.12)',
      }}
    >
      <Typography variant="h6" className="crt-heading" sx={{ mb: 1 }}>
        Chat
      </Typography>

      <Stack spacing={1} sx={{ maxHeight: 220, overflowY: 'auto', pr: 1 }}>
        {messages.map((message) => {
          const isLocal = localUserId !== null && message.userId === localUserId;
          return (
            <Box
              key={`${message.timestamp}-${message.userId}-${message.text}`}
              sx={{ display: 'flex', justifyContent: isLocal ? 'flex-end' : 'flex-start' }}
            >
              <Paper
                sx={{
                  p: 1,
                  maxWidth: '85%',
                  bgcolor: isLocal ? 'rgba(57, 255, 20, 0.14)' : 'rgba(157, 255, 149, 0.08)',
                  border: '1px solid rgba(57, 255, 20, 0.22)',
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  {message.username}
                </Typography>
                <Typography variant="body2">{message.text}</Typography>
              </Paper>
            </Box>
          );
        })}
        <div ref={bottomRef} />
      </Stack>

      <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Escribe un mensaje"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitMessage();
            }
          }}
          disabled={isDisabled}
          inputProps={{ maxLength: 200 }}
        />
        <Button variant="contained" onClick={submitMessage} disabled={isDisabled}>
          Enviar
        </Button>
      </Box>
    </Paper>
  );
}
