import React, { useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Box, Button, CircularProgress, Link, TextField, Typography, Alert } from '@mui/material'
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined'
import { registerUser } from '../api/authApi'
import { useAuth } from '../context/AuthContext'
import AuthFormCard from './AuthFormCard'

const RegisterForm: React.FC = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [responseMessage, setResponseMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setResponseMessage(null)
    setError(null)

    if (!username.trim()) {
      setError('Please enter a username.')
      return
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const session = await registerUser(username, password)
      login(session.accessToken, session.user)

      if (session?.user?.username) {
        setResponseMessage(`Hello ${session.user.username}! Welcome to YOVI!`)
      } else {
        setResponseMessage('Registration completed successfully.')
      }

      setUsername('')
      setPassword('')
      setTimeout(() => navigate('/'), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFormCard icon={<PersonAddOutlinedIcon />} iconBgColor="secondary.main" title="Create an account">
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
          autoComplete="new-password"
          helperText="Minimum 8 characters"
          disabled={loading}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {responseMessage && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {responseMessage}
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
          {loading ? <CircularProgress size={24} color="inherit" /> : "Let's go!"}
        </Button>

        <Typography variant="body2" align="center" color="text.secondary">
          Already have an account?{' '}
          <Link component={RouterLink} to="/login" underline="hover" fontWeight={600}>
            Login here
          </Link>
        </Typography>
      </Box>
    </AuthFormCard>
  )
}

export default RegisterForm
