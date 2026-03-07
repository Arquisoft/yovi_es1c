import React, { useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  TextField,
  Typography,
  Alert,
} from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { loginUser } from '../api/authApi'
import { useAuth } from '../context/AuthContext'

const LoginForm: React.FC = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!username.trim()) {
      setError('Please enter a username.')
      return
    }
    if (!password) {
      setError('Please enter a password.')
      return
    }

    setLoading(true)
    try {
      const session = await loginUser(username, password)
      login(session.accessToken, session.user)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
      }}
    >
      <Paper
        elevation={4}
        sx={{
          p: { xs: 3, sm: 5 },
          width: '100%',
          maxWidth: 420,
          borderRadius: 3,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
          <Box
            sx={{
              bgcolor: 'primary.main',
              color: 'white',
              borderRadius: '50%',
              p: 1.2,
              mb: 1.5,
              display: 'flex',
            }}
          >
            <LockOutlinedIcon />
          </Box>
          <Typography component="h1" variant="h5" fontWeight={700}>
            Login to YOVI
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Username"
            fullWidth
            margin="normal"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            disabled={loading}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            sx={{ mt: 3, mb: 2, py: 1.4, borderRadius: 2, fontWeight: 600 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Login'}
          </Button>

          <Typography variant="body2" align="center" color="text.secondary">
            No account?{' '}
            <Link component={RouterLink} to="/register" underline="hover" fontWeight={600}>
              Register here
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Box>
  )
}

export default LoginForm
