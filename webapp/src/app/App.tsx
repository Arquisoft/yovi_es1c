import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import styles from './styles/App.module.css';
import { phosphorTheme } from './theme/phosphorTheme';

import RegisterForm from '../features/auth/ui/RegisterForm.tsx';
import LoginForm from '../features/auth/ui/LoginForm.tsx';
import GameUI from '../features/game/ui/tsx/GameUI.tsx';
import Nav from '../components/layout/Nav';
import { AuthProvider, useAuth } from '../features/auth';
import CreateMatchPage from '../features/game/ui/tsx/CreateMatchPage.tsx';
import OnlineMatchmakingPage from '../features/game/ui/tsx/OnlineMatchmakingPage.tsx';
import StatsUI from '../features/stats/ui/StatsUI.tsx';
import LeaderboardUI from '../features/ranking/ui/LeaderboardUI.tsx';
import { ProfilePage } from '../features/profile';
import { FriendsPage } from '../features/friends';
import { MessagesPage } from '../features/messages';
import { useActiveSession } from '../features/game/hooks/useActiveSession';
import { usePendingRematchNotification } from '../features/game/hooks/usePendingRematchNotification';
import { useFriendMatchInvites } from '../features/game/hooks/useFriendMatchInvites';
import { fetchWithAuth } from '../shared/api/fetchWithAuth';
import { API_CONFIG } from '../config/api.config';
import { useTranslation } from 'react-i18next';

function HomeScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
      <section className={styles.homeScreen}>
        <div className={styles.homeBackdrop} />
        <div className={`${styles.homeFrame} crt-panel crt-flicker`}>
        <pre className={styles.homeAscii}>{`██╗   ██╗ ██████╗ ██╗   ██╗██╗       ███████╗███████╗ ██╗ ██████╗
╚██╗ ██╔╝██╔═══██╗██║   ██║██║       ██╔════╝██╔════╝███║██╔════╝
 ╚████╔╝ ██║   ██║██║   ██║██║       █████╗  ███████╗╚██║██║     
  ╚██╔╝  ██║   ██║╚██╗ ██╔╝██║       ██╔══╝  ╚════██║ ██║██║     
   ██║   ╚██████╔╝ ╚████╔╝ ██║ ══════███████╗███████║ ██║╚██████╗
   ╚═╝    ╚═════╝   ╚═══╝  ╚═╝       ╚══════╝╚══════╝ ╚═╝ ╚═════╝`}</pre>
          <div className={`${styles.statusLine} crt-blink`}>{t('player1Up')}</div>
          <h1 className={styles.heroTitle}>{t('welcome')}</h1>
          <p className={styles.heroUser}>{user.username}</p>
          <div className={styles.actionRow}>
            <RouterLink to="/create-match" className={styles.primaryAction}>
              {t('play')}
            </RouterLink>
            <RouterLink to="/stats" className={styles.secondaryAction}>
              {t('stats')}
            </RouterLink>
          </div>
          <p className={`${styles.promptLine} crt-blink`}>{t('pressStart')}</p>
        </div>
      </section>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { matchId, boardSize, source: activeSessionSource, opponent: activeSessionOpponent, rules: activeSessionRules } = useActiveSession();
  const [dismissedMatchId, setDismissedMatchId] = useState<string | null>(null);
  const { t } = useTranslation();
  const {
    pendingRematch,
    readyRematch,
    acceptPendingRematch,
    declinePendingRematch,
    clearReadyRematch,
  } = usePendingRematchNotification(Boolean(user && location.pathname !== '/gamey'));
  const {
    pendingFriendInvite,
    outgoingFriendInvite,
    readyFriendMatch,
    notice: friendMatchNotice,
    errorKey: friendInviteErrorKey,
    acceptPendingFriendInvite,
    declinePendingFriendInvite,
    cancelOutgoingFriendInvite,
    clearReadyFriendMatch,
    clearFriendMatchNotice,
  } = useFriendMatchInvites(Boolean(user && location.pathname !== '/gamey'));

  const storageKey = useMemo(() => (matchId ? `abandoned:${matchId}` : null), [matchId]);
  const isDismissed = useMemo(
      () => (storageKey ? localStorage.getItem(storageKey) === 'true' : false),
      [storageKey],
  );

  const shouldPrompt = Boolean(
      user &&
      matchId &&
      boardSize &&
      !isDismissed &&
      dismissedMatchId !== matchId &&
      location.pathname !== '/gamey',
  );

  const shouldShowRematchPrompt = Boolean(
      user &&
      pendingRematch &&
      !shouldPrompt &&
      location.pathname !== '/gamey',
  );

  const shouldShowFriendInvitePrompt = Boolean(
      user &&
      pendingFriendInvite &&
      !shouldPrompt &&
      !shouldShowRematchPrompt &&
      location.pathname !== '/gamey',
  );

  const shouldShowOutgoingFriendInvitePrompt = Boolean(
      user &&
      outgoingFriendInvite &&
      !shouldPrompt &&
      !shouldShowRematchPrompt &&
      !shouldShowFriendInvitePrompt &&
      location.pathname !== '/gamey',
  );

  const shouldShowFriendMatchNotice = Boolean(
      user &&
      friendMatchNotice &&
      !shouldPrompt &&
      !shouldShowRematchPrompt &&
      !shouldShowFriendInvitePrompt &&
      !shouldShowOutgoingFriendInvitePrompt &&
      location.pathname !== '/gamey',
  );

  useEffect(() => {
    if (!matchId && dismissedMatchId !== null) {
      setDismissedMatchId(null);
    }
  }, [matchId, dismissedMatchId]);

  useEffect(() => {
    if (!readyRematch) return;
    navigate('/gamey', {
      state: {
        matchId: readyRematch.newMatchId,
        boardSize: readyRematch.size,
        mode: 'ONLINE',
        difficulty: 'medium',
        rules: readyRematch.rules,
      },
    });
    clearReadyRematch();
  }, [readyRematch, navigate, clearReadyRematch]);

  useEffect(() => {
    if (!readyFriendMatch) return;
    navigate('/gamey', {
      state: {
        matchId: readyFriendMatch.matchId,
        boardSize: readyFriendMatch.boardSize ?? readyFriendMatch.size,
        mode: 'ONLINE',
        difficulty: 'medium',
        rules: readyFriendMatch.rules,
      },
    });
    clearReadyFriendMatch();
  }, [readyFriendMatch, navigate, clearReadyFriendMatch]);

  const handleReconnect = async () => {
    if (!matchId || !boardSize) return;
    const response = await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/sessions/${matchId}/reconnect`, {
      method: 'POST',
    });
    if (!response.ok) return;
    navigate('/gamey', {
      state: {
        matchId,
        boardSize,
        mode: 'ONLINE',
        difficulty: 'medium',
        ...(activeSessionRules ? { rules: activeSessionRules } : {}),
      },
    });
  };

  const handleAbandon = async () => {
    if (!matchId) return;
    await fetchWithAuth(`${API_CONFIG.GAME_SERVICE_API}/online/sessions/${matchId}/abandon`, {
      method: 'POST',
    });
    localStorage.removeItem(`abandoned:${matchId}`);
    setDismissedMatchId(matchId);
  };

  const activeSessionOpponentName = activeSessionOpponent?.username ?? t('opponent');
  const friendMatchNoticePlayer = friendMatchNotice?.invite?.requesterId === user?.id
      ? friendMatchNotice?.invite?.recipientName
      : friendMatchNotice?.invite?.requesterName;
  const friendMatchNoticeKey = friendMatchNotice ? `friendMatchNotice.${friendMatchNotice.kind}` : 'friendMatchNotice.expired';

  return (
      <>
        <div className={styles.App}>
          <div className={styles.screenNoise} />
          <div className={styles.vignette} />
          <div className={styles.crtOverlay} />
          <span className={`${styles.cornerDeco} ${styles.cornerTopLeft}`} />
          <span className={`${styles.cornerDeco} ${styles.cornerTopRight}`} />
          <span className={`${styles.cornerDeco} ${styles.cornerBottomLeft}`} />
          <span className={`${styles.cornerDeco} ${styles.cornerBottomRight}`} />
          <Nav />
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/login" element={<LoginForm />} />
            <Route path="/register" element={<RegisterForm />} />
            <Route path="/create-match" element={<CreateMatchPage />} />
            <Route path="/online/matchmaking" element={<OnlineMatchmakingPage />} />
            <Route path="/gamey" element={<GameUI />} />
            <Route path="/stats" element={<StatsUI />} />
            <Route path="/ranking" element={<LeaderboardUI />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:friendId" element={<MessagesPage />} />
          </Routes>
        </div>

        <Dialog
            open={shouldPrompt}
            slotProps={{
              paper: {
                sx: {
                  minWidth: { xs: 'auto', sm: 460 },
                  border: '1px solid rgba(57, 255, 20, 0.34)',
                  background: 'linear-gradient(180deg, rgba(7, 24, 7, 0.96) 0%, rgba(2, 14, 2, 0.94) 100%)',
                },
              },
            }}
        >
          <DialogTitle sx={{ color: 'primary.main', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {activeSessionSource === 'friend'
                ? t('friendMatchActiveTitle', { player: activeSessionOpponentName })
                : t('activeMatchTitle')}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {activeSessionSource === 'friend'
                  ? t('friendMatchActiveBody', { player: activeSessionOpponentName })
                  : t('activeMatchMessage')}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="outlined" onClick={handleAbandon}>
              {t('abandon')}
            </Button>
            <Button variant="contained" onClick={handleReconnect}>
              {t('reconnect')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
            open={shouldShowFriendInvitePrompt}
            slotProps={{
              paper: {
                sx: {
                  minWidth: { xs: 'auto', sm: 460 },
                  border: '1px solid rgba(57, 255, 20, 0.34)',
                  background: 'linear-gradient(180deg, rgba(7, 24, 7, 0.96) 0%, rgba(2, 14, 2, 0.94) 100%)',
                },
              },
            }}
        >
          <DialogTitle sx={{ color: 'primary.main', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {t('friendMatchIncomingTitle', { player: pendingFriendInvite?.requesterName ?? t('opponent') })}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {t('friendMatchIncomingBody', { player: pendingFriendInvite?.requesterName ?? t('opponent'), boardSize: pendingFriendInvite?.boardSize ?? '' })}
            </Typography>
            {friendInviteErrorKey ? (
              <Typography color="error" sx={{ mt: 1 }}>
                {t(friendInviteErrorKey)}
              </Typography>
            ) : null}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="outlined" onClick={declinePendingFriendInvite}>
              {t('friendMatchDecline')}
            </Button>
            <Button variant="contained" onClick={acceptPendingFriendInvite}>
              {t('friendMatchAccept')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
            open={shouldShowOutgoingFriendInvitePrompt}
            slotProps={{
              paper: {
                sx: {
                  minWidth: { xs: 'auto', sm: 460 },
                  border: '1px solid rgba(57, 255, 20, 0.34)',
                  background: 'linear-gradient(180deg, rgba(7, 24, 7, 0.96) 0%, rgba(2, 14, 2, 0.94) 100%)',
                },
              },
            }}
        >
          <DialogTitle sx={{ color: 'primary.main', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {t('friendMatchInviteSentTitle')}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {t('friendMatchInviteSentBody', { player: outgoingFriendInvite?.recipientName ?? t('opponent') })}
            </Typography>
            {friendInviteErrorKey ? (
              <Typography color="error" sx={{ mt: 1 }}>
                {t(friendInviteErrorKey)}
              </Typography>
            ) : null}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="outlined" onClick={cancelOutgoingFriendInvite}>
              {t('friendMatchCancelInvite')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
            open={shouldShowFriendMatchNotice}
            onClose={clearFriendMatchNotice}
            slotProps={{
              paper: {
                sx: {
                  minWidth: { xs: 'auto', sm: 460 },
                  border: '1px solid rgba(57, 255, 20, 0.34)',
                  background: 'linear-gradient(180deg, rgba(7, 24, 7, 0.96) 0%, rgba(2, 14, 2, 0.94) 100%)',
                },
              },
            }}
        >
          <DialogTitle sx={{ color: 'primary.main', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {t('friendMatchNoticeTitle')}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {t(friendMatchNoticeKey, { player: friendMatchNoticePlayer ?? t('opponent') })}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="contained" onClick={clearFriendMatchNotice}>
              {t('ok')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
            open={shouldShowRematchPrompt}
            slotProps={{
              paper: {
                sx: {
                  minWidth: { xs: 'auto', sm: 460 },
                  border: '1px solid rgba(57, 255, 20, 0.34)',
                  background: 'linear-gradient(180deg, rgba(7, 24, 7, 0.96) 0%, rgba(2, 14, 2, 0.94) 100%)',
                },
              },
            }}
        >
          <DialogTitle sx={{ color: 'primary.main', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {t('rematchRequestTitle', { player: pendingRematch?.requesterName ?? t('opponent') })}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {t('rematchRequestBody', { player: pendingRematch?.requesterName ?? t('opponent') })}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="outlined" onClick={declinePendingRematch}>
              {t('declineRematch')}
            </Button>
            <Button variant="contained" onClick={acceptPendingRematch}>
              {t('acceptRematch')}
            </Button>
          </DialogActions>
        </Dialog>
      </>
  );
}

function App() {
  return (
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider theme={phosphorTheme}>
            <CssBaseline />
            <AppContent />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
  );
}

export default App;
