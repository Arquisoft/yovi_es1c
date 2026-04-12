import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import styles from './Nav.module.css';
import logoDark from '../../assets/gamey-logo-white.png';
import logoLight from '../../assets/gamey-logo-black.png';
import { useAuth } from '../../features/auth';
import { logoutSession } from '../../features/auth/api/authApi';
import {useTranslation} from "react-i18next";

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const { t } = useTranslation();

  const handleLogout = async () => {
    await logoutSession();
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setIsDark(event.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = globalThis.scrollY;
      setIsVisible(currentScrollY < lastScrollY || currentScrollY < 50);
      setLastScrollY(currentScrollY);
    };

    globalThis.addEventListener('scroll', handleScroll, { passive: true });
    return () => globalThis.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const linkClass = (path: string) => {
    const active = location.pathname === path ? styles.active : '';
    return `${styles.link} ${active}`.trim();
  };

  return (
    <nav className={`${styles.nav} ${isDark ? styles.dark : styles.light} ${isVisible ? styles.visible : styles.hidden}`}>
      <Link to="/" className={styles.brand}>
        <img src={isDark ? logoDark : logoLight} alt="Game Y Logo" className={styles.logo} />
        <span className={styles.brandText}>
          <span className={styles.brandTitle}>YOVI</span>
        </span>
      </Link>

      <ul className={styles.links}>
        <li>
          <Link to="/" className={linkClass('/')}>{t('home')}</Link>
        </li>
        <li>
          <Link to="/create-match" className={linkClass('/create-match')}>{t('newGame')}</Link>
        </li>
        <li>
          <Link to="/stats" className={linkClass('/stats')}>{t('stats')}</Link>
        </li>
        {user ? (
          <>
            <li>
              <span className={`${styles.link} ${styles.username}`}>{user.username}</span>
            </li>
            <li>
              <button type="button" onClick={handleLogout} className={`${styles.link} ${styles.logoutButton}`}>
                {t('logout')}
              </button>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to="/login" className={linkClass('/login')}>{t('login')}</Link>
            </li>
            <li>
              <Link to="/register" className={linkClass('/register')}>{t('register')}</Link>
            </li>
          </>
        )}
      </ul>
    </nav>
  );
}
