import React from 'react';
import { Box, Paper, Typography } from '@mui/material';

interface AuthFormCardProps {
  icon: React.ReactNode;
  iconBgColor?: string;
  title: string;
  children: React.ReactNode;
}

const AuthFormCard: React.FC<AuthFormCardProps> = ({ icon, iconBgColor = 'primary.main', title, children }) => (
  <Box
    sx={{
      width: '100%',
      minHeight: '100vh',
      pt: '58px',
      px: 2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      background:
        'radial-gradient(circle at 50% 26%, rgba(53,137,42,0.22), transparent 24%), linear-gradient(180deg, rgba(4,18,4,0.96) 0%, rgba(1,10,1,0.96) 100%)',
    }}
  >
    <Paper
      className="crt-panel"
      elevation={0}
      sx={{
        width: '100%',
        maxWidth: 430,
        p: { xs: 3, sm: 4.5 },
        position: 'relative',
        zIndex: 1,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3.5 }}>
        <Typography className="crt-screen-label crt-blink" sx={{ mb: 1.2, fontSize: '0.82rem' }}>
          YOVI terminal
        </Typography>
        <Box
          sx={{
            width: 58,
            height: 58,
            display: 'grid',
            placeItems: 'center',
            mb: 1.6,
            border: '1px solid rgba(57, 255, 20, 0.35)',
            color: '#031103',
            background: iconBgColor,
            boxShadow: '0 0 14px rgba(57, 255, 20, 0.32)',
          }}
        >
          {icon}
        </Box>
        <Typography component="h1" variant="h4" className="crt-heading" sx={{ textAlign: 'center' }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Paper>
  </Box>
);

export default AuthFormCard;
