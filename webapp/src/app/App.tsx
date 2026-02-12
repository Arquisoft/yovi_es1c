import { useEffect, useState } from 'react';
import './styles/App.css'
import RegisterForm from '../features/auth/ui/RegisterForm.tsx';
import GameUI from '../features/game/ui/GameUI.tsx';
import reactLogo from '../assets/react.svg'

function App() {
    const [path, setPath] = useState(() => window.location.pathname);

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const navigate = (nextPath: string) => {
        if (nextPath === path) return;
        window.history.pushState({}, '', nextPath);
        setPath(nextPath);
    };

    const isGameRoute = path === '/game';

    return (
        <div className="App">
            <div>
                <a href="https://vitejs.dev" target="_blank" rel="noreferrer">
                    <img src="/vite.svg" className="logo" alt="Vite logo" />
                </a>
                <a href="https://react.dev" target="_blank" rel="noreferrer">
                    <img src={reactLogo} className="logo react" alt="React logo" />
                </a>
            </div>

            <h2>Welcome to the Software Arquitecture 2025-2026 course</h2>
            {isGameRoute ? (
                <div style={{ marginTop: '32px' }}>
                    <div style={{ marginBottom: '16px' }}>
                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #333',
                                cursor: 'pointer',
                            }}
                        >
                            Volver
                        </button>
                    </div>
                    <GameUI />
                </div>
            ) : (
                <>
                    <RegisterForm />
                    <div style={{ marginTop: '32px' }}>
                        <button
                            type="button"
                            onClick={() => navigate('/game')}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '8px',
                                border: '2px solid #333',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                            }}
                        >
                            Jugar
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default App;
