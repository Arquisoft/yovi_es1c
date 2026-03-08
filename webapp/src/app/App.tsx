import { BrowserRouter, Routes, Route, Navigate, Link as RouterLink } from 'react-router-dom';
import { Box, Button, CssBaseline, Typography } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import styles from './styles/App.module.css';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        background: {
            default: '#242424',
            paper: '#1a1a1a',
        },
    },
});
import RegisterForm from '../features/auth/ui/RegisterForm.tsx';
import LoginForm from '../features/auth/ui/LoginForm.tsx';
import GameUI from '../features/game/ui/tsx/GameUI.tsx';
import Nav from '../components/layout/Nav';
import { AuthProvider, useAuth } from '../features/auth/context/AuthContext';
import CreateMatchPage from '../features/game/ui/tsx/CreateMatchPage.tsx';

function HomeRedirect() {
    const { user } = useAuth();
    if (user) {
        return (
            <Box
                sx={{
                    minHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    px: 2,
                    textAlign: 'center',
                }}
            >
                <Typography variant="h4" fontWeight={700}>
                    Welcome back, {user.username}!
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Ready to play? Choose an option below.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Button
                        component={RouterLink}
                        to="/create-match"
                        variant="contained"
                        size="large"
                        sx={{ borderRadius: 2, fontWeight: 600, px: 4 }}
                    >
                        Play
                    </Button>
                    <Button
                        component={RouterLink}
                        to="/stats"
                        variant="outlined"
                        size="large"
                        sx={{ borderRadius: 2, fontWeight: 600, px: 4 }}
                    >
                        Stats
                    </Button>
                </Box>
            </Box>
        );
    }
    return <Navigate to="/login" replace />;
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <ThemeProvider theme={darkTheme}>
                <CssBaseline />
                <div className={styles.App}>
                    <Nav />

                    <Routes>
                        <Route path="/" element={<HomeRedirect />} />
                        <Route path="/login" element={<LoginForm />} />
                        <Route path="/register" element={<RegisterForm />} />
                        <Route path="/create-match" element={<CreateMatchPage />} />
                        <Route path="/gamey" element={<GameUI />} />
                        <Route path="/stats" element={
                            <div className={styles['content-wrapper']}>
                                <h2>Estadísticas</h2>
                                <p>Aquí irán las estadísticas del juego</p>
                            </div>
                        } />
                    </Routes>
                </div>
                </ThemeProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
