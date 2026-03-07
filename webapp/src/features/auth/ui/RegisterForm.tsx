import React, { useState } from 'react';
import { registerUser } from '../api/authApi';

const RegisterForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setResponseMessage(null);
    setError(null);

    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const session = await registerUser(username, password);

      if (session?.user?.username) {
        setResponseMessage(
          `Hello ${session.user.username}! Welcome to the course!`,
        );
      } else {
        setResponseMessage('Registration completed successfully.');
      }

      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="register-form">
      <div className="form-group">
        <label htmlFor="username">Whats your name?</label>
        <input
          type="text"
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">Choose a password</label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="form-input"
        />
      </div>

      <button type="submit" className="submit-button" disabled={loading}>
        {loading ? 'Entering...' : 'Lets go!'}
      </button>

      {responseMessage && (
        <div
          className="success-message"
          style={{ marginTop: 12, color: 'green' }}
        >
          {responseMessage}
        </div>
      )}

      {error && (
        <div className="error-message" style={{ marginTop: 12, color: 'red' }}>
          {error}
        </div>
      )}
    </form>
  );
};

export default RegisterForm;
