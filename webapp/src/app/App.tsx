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
import { useActiveSession } from '../features/game/hooks/useActiveSession';
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
  const { matchId, boardSize } = useActiveSession();
  const [dismissedMatchId, setDismissedMatchId] = useState<string | null>(null);
  const { t } = useTranslation();

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

  useEffect(() => {
    if (!matchId && dismissedMatchId !== null) {
      setDismissedMatchId(null);
    }
  }, [matchId, dismissedMatchId]);

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
        {t('activeMatchTitle')}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {t('activeMatchMessage')}
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
