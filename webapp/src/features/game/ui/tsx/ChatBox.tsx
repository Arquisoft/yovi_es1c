import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import type { ChatMessage } from '../../hooks/useChatSession';
import { fetchWithAuth } from '../../../../shared/api/fetchWithAuth';
import { API_CONFIG } from '../../../../config/api.config';
import { DEFAULT_AVATAR } from '../../../profile/ui/avatarOptions';

interface ChatBoxProps {
    readonly matchId: string | null;
    readonly winner: 'B' | 'R' | null;
    readonly localUserId: number | null;
    readonly messages: ChatMessage[];
    readonly sendMessage: (text: string) => void;
    readonly players: { userId: number; username: string; displayName?: string | null; avatar?: string | null }[];

}

type PlayerProfile = {
    id: number;
    username: string;
    displayName: string | null;
    avatar: string | null;
};

const QUICK_EMOJIS = [
    '😀', '😂', '😎', '😢', '😡', '👍', '👎', '🎉', '🔥', '❤️',
    '😮', '🤔', '😅', '🙌', '💪', '🤝', '😴', '🤯', '😈', '👋',
    '⭐', '🏆', '🎯', '💡', '🚀', '🌟', '💎', '🎲', '♟️', '🃏',
];

export default function ChatBox({ matchId, winner, localUserId, messages, sendMessage, players }: ChatBoxProps) {
    const [text, setText] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [playerProfiles, setPlayerProfiles] = useState<Record<number, PlayerProfile>>({});
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (typeof bottomRef.current?.scrollIntoView === 'function') {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    useEffect(() => {
        let ignore = false;

        const userIds = players
            .map((player) => player.userId)
            .filter((userId) => userId > 0);

        if (userIds.length === 0) {
            setPlayerProfiles({});
            return () => {
                ignore = true;
            };
        }

        async function loadPlayerProfiles() {
            try {
                const responses = await Promise.all(
                    userIds.map((userId) => fetchWithAuth(`${API_CONFIG.USERS_API}/profiles/${userId}`)),
                );

                const profiles = await Promise.all(
                    responses
                        .filter((response) => response.ok)
                        .map(async (response) => response.json() as Promise<{
                            user_id?: number;
                            id?: number;
                            username?: string;
                            display_name?: string | null;
                            displayName?: string | null;
                            avatar?: string | null;
                        }>),
                );

                if (ignore) {
                    return;
                }

                const nextProfiles = profiles.reduce<Record<number, PlayerProfile>>((acc, profile) => {
                    const id = profile.user_id ?? profile.id;
                    if (!id) {
                        return acc;
                    }

                    acc[id] = {
                        id,
                        username: profile.username ?? '',
                        displayName: profile.displayName ?? profile.display_name ?? null,
                        avatar: profile.avatar ?? DEFAULT_AVATAR,
                    };
                    return acc;
                }, {});

                setPlayerProfiles(nextProfiles);
            } catch {
                if (!ignore) {
                    setPlayerProfiles({});
                }
            }
        }

        void loadPlayerProfiles();

        return () => {
            ignore = true;
        };
    }, [players]);

    const isDisabled = !matchId || winner !== null;

    const submitMessage = () => {
        const trimmed = text.trim();
        if (!trimmed || isDisabled) return;
        sendMessage(trimmed);
        setText('');
        setShowEmojiPicker(false);
    };

    const handleInsertEmoji = (emoji: string) => {
        if (isDisabled) return;
        setText((prev) => `${prev}${emoji}`);
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
                    const player = players.find((p) => p.userId === message.userId);
                    const profile = playerProfiles[message.userId];
                    const avatar = profile?.avatar ?? player?.avatar ?? DEFAULT_AVATAR;
                    const username = profile?.username ?? player?.username ?? message.username;
                    const displayName = profile?.displayName ?? player?.displayName ?? username;
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
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                    <Box
                                        component="img"
                                        src={avatar}
                                        alt={`Avatar de ${displayName}`}
                                        sx={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            border: '1px solid rgba(57, 255, 20, 0.25)',
                                        }}
                                    />
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontWeight: 700 }}>
                                            {displayName}
                                        </Typography>
                                        {displayName !== username ? (
                                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', opacity: 0.75 }}>
                                                @{username}
                                            </Typography>
                                        ) : null}
                                    </Box>
                                </Box>
    
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
                <IconButton
                    aria-label="Insertar emoji"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    disabled={isDisabled}
                    size="small"
                    sx={{ border: '1px solid rgba(57, 255, 20, 0.22)', borderRadius: 1 }}
                >
                    😊
                </IconButton>
                <Button variant="contained" onClick={submitMessage} disabled={isDisabled}>
                    Enviar
                </Button>
            </Box>

            {showEmojiPicker && !isDisabled && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap' }}>
                    {QUICK_EMOJIS.map((emoji) => (
                        <Button key={emoji} size="small" onClick={() => handleInsertEmoji(emoji)}>
                            {emoji}
                        </Button>
                    ))}
                </Stack>
            )}
        </Paper>
    );
}
