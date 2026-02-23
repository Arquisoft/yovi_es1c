import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import styles from './Nav.module.css';
import logoDark from '../../assets/gamey-logo-white.png';
import logoLight from '../../assets/gamey-logo-black.png';

export default function Nav() {
    const [isDark, setIsDark] = useState(
        window.matchMedia('(prefers-color-scheme: dark)').matches
    );

    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches);

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;

            if (currentScrollY < lastScrollY || currentScrollY < 50) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }

            setLastScrollY(currentScrollY);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [lastScrollY]);

    return (
        <nav className={`
            ${styles.nav} 
            ${isDark ? styles.dark : styles.light}
            ${isVisible ? styles.visible : styles.hidden}
        `}>
            <Link to="/" className={styles.brand}>
                <img
                    src={isDark ? logoDark : logoLight}
                    alt="Game Y Logo"
                    className={styles.logo}
                />
            </Link>

            <ul className={styles.links}>
                <li>
                    <Link to="/" className={styles.link}>Home</Link>
                </li>
                <li>
                    <Link to="/create-match" className={styles.link}>New game</Link>                </li>
                <li>
                    <Link to="/stats" className={styles.link}>Stats</Link>
                </li>
            </ul>
        </nav>
    );
}
