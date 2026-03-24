import { useCallback, useEffect, useRef, useState } from 'react';
import { onlineSocketClient } from '../realtime/onlineSocketClient';

export interface ChatMessage {
  userId: number;
  username: string;
  text: string;
  timestamp: number;
}

interface ChatMessagePayload extends ChatMessage {
  matchId: string;
}

interface SessionStateWithMessagesPayload {
  matchId: string;
  messages?: ChatMessage[];
}

export function useChatSession(matchId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const seenMessagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setMessages([]);
    seenMessagesRef.current.clear();

    if (!matchId) return;

    const addMessages = (incoming: ChatMessage[]) => {
      setMessages((prev) => {
        const next = [...prev];
        for (const message of incoming) {
          const key = `${message.timestamp}-${message.userId}`;
          if (seenMessagesRef.current.has(key)) continue;
          seenMessagesRef.current.add(key);
          next.push(message);
        }
        return next.sort((a, b) => a.timestamp - b.timestamp);
      });
    };

    const unsubscribeChat = onlineSocketClient.on<ChatMessagePayload>('chat:message', (payload) => {
      if (payload.matchId !== matchId) return;
      addMessages([{ userId: payload.userId, username: payload.username, text: payload.text, timestamp: payload.timestamp }]);
    });

    const unsubscribeState = onlineSocketClient.on<SessionStateWithMessagesPayload>('session:state', (payload) => {
      if (payload.matchId !== matchId || !payload.messages) return;
      addMessages(payload.messages);
    });

    return () => {
      unsubscribeChat();
      unsubscribeState();
    };
  }, [matchId]);

  const sendMessage = useCallback(
      (text: string) => {
        if (!matchId) return;
        onlineSocketClient.emit('chat:message', { matchId, text });
      },
      [matchId],
  );

  return {
    messages,
    sendMessage,
  };
}
