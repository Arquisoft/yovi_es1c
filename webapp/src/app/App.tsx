// webapp/src/app/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles/App.css';
import RegisterForm from '../features/auth/ui/RegisterForm.tsx';
import GameUI from '../features/game/ui/GameUI.tsx';
import Nav from '../components/layout/Nav';

function App() {
    return (
        <BrowserRouter>
            <div className="App">
                <Nav />

                <Routes>
                    <Route path="/" element={
                        <div className="content-wrapper">
                            <h2>Welcome to the Software Arquitecture 2025-2026 course</h2>
                            <RegisterForm />
                        </div>
                    } />

                    <Route path="/gamey" element={<GameUI />} />

                    <Route path="/stats" element={
                        <div className="content-wrapper">
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
