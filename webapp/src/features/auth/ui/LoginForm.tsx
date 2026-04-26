import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { Box, Button, CircularProgress, Link, TextField, Typography, Alert } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { loginUser } from '../api/authApi';
import { getMyProfile } from '../../profile/api/profileApi';
import { useAuth } from '../context/useAuth';
import AuthFormCard from './AuthFormCard';
import {useTranslation} from "react-i18next";

const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError(t('pleaseEnterUsername'));
      return;
    }

    if (!password) {
      setError(t('pleaseEnterPassword'));
      return;
    }

    setLoading(true);
    try {
      const session = await loginUser(username, password);
      login(session.accessToken, session.refreshToken, session.user);
      await getMyProfile().catch((profileError) => {
        console.warn('Could not initialize user profile:', profileError);
      });
      navigate('/');
    } catch (err) {
      const key = err instanceof Error ? err.message : 'networkError';
      setError(t(key))
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormCard icon={<LockOutlinedIcon />} title={t('loginToYOVI')}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <TextField
          label={t('username')}
          fullWidth
          margin="normal"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoFocus
          disabled={loading}
        />
        <TextField
          label={t('password')}
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          disabled={loading}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Button
          type="submit"
          fullWidth
          variant="contained"
          size="large"
          disabled={loading}
          sx={{ mt: 3, mb: 2, py: 1.35 }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : t('login')}
        </Button>

        <Typography variant="body2" align="center" className="crt-muted" sx={{ letterSpacing: '0.12em' }}>
          {t('noAccount')}{' '}
          <Link component={RouterLink} to="/register" underline="none" fontWeight={400} sx={{ letterSpacing: '0.12em' }}>
            {t('registerHere')}
          </Link>
        </Typography>
      </Box>
    </AuthFormCard>
  );
};

export default LoginForm;
