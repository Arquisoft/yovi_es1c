import { BrowserRouter, Routes, Route } from 'react-router-dom';
import styles from './styles/App.module.css';
import RegisterForm from '../features/auth/ui/RegisterForm.tsx';
import GameUI from '../features/game/ui/tsx/GameUI.tsx';
import Nav from '../components/layout/Nav';
import CreateMatchPage from '../features/game/ui/tsx/CreateMatchPage.tsx';

function App() {
    return (
        <BrowserRouter>
            <div className={styles.App}>
                <Nav />

                <Routes>
                    <Route path="/" element={
                        <div className={styles['content-wrapper']}>
                            <h2>Welcome to the Software Arquitecture 2025-2026 course</h2>
                            <RegisterForm />
                        </div>
                    } />

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
        </BrowserRouter>
    );
}

export default App;
