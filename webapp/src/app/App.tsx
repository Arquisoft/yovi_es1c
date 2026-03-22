import { BrowserRouter, Routes, Route, Navigate, Link as RouterLink } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import styles from './styles/App.module.css';
import { phosphorTheme } from './theme/phosphorTheme';

import RegisterForm from '../features/auth/ui/RegisterForm.tsx';
import LoginForm from '../features/auth/ui/LoginForm.tsx';
import GameUI from '../features/game/ui/tsx/GameUI.tsx';
import Nav from '../components/layout/Nav';
import { AuthProvider, useAuth } from '../features/auth';
import CreateMatchPage from '../features/game/ui/tsx/CreateMatchPage.tsx';
import StatsUI from '../features/stats/ui/StatsUI.tsx';

function HomeScreen() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <section className={styles.homeScreen}>
      <div className={styles.homeBackdrop} />
      <div className={`${styles.homeFrame} crt-panel crt-flicker`}>
        <pre className={styles.homeAscii}>{`██╗   ██╗ ██████╗ ██╗   ██╗██╗
╚██╗ ██╔╝██╔═══██╗██║   ██║██║
 ╚████╔╝ ██║   ██║██║   ██║██║
  ╚██╔╝  ██║   ██║╚██╗ ██╔╝██║
   ██║   ╚██████╔╝ ╚████╔╝ ██║
   ╚═╝    ╚═════╝   ╚═══╝  ╚═╝`}</pre>
        <div className={`${styles.statusLine} crt-blink`}>Player 1 up</div>
        <h1 className={styles.heroTitle}>Welcome back</h1>
        <p className={styles.heroUser}>{user.username}</p>
        <div className={styles.actionRow}>
          <RouterLink to="/create-match" className={styles.primaryAction}>
            Play
          </RouterLink>
          <RouterLink to="/stats" className={styles.secondaryAction}>
            Stats
          </RouterLink>
        </div>
        <p className={`${styles.promptLine} crt-blink`}>Press start</p>
      </div>
    </section>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider theme={phosphorTheme}>
          <CssBaseline />
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
              <Route path="/gamey" element={<GameUI />} />
              <Route path="/stats" element={<StatsUI />} />
            </Routes>
          </div>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
