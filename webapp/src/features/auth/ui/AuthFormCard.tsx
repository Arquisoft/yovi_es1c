import React from 'react'
import { Box, Paper, Typography } from '@mui/material'

interface AuthFormCardProps {
  icon: React.ReactNode
  iconBgColor?: string
  title: string
  children: React.ReactNode
}

const AuthFormCard: React.FC<AuthFormCardProps> = ({ icon, iconBgColor = 'primary.main', title, children }) => (
  <Box
    sx={{
      width: '100%',
      minHeight: 'calc(100vh - 94px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      justifyItems: 'center',
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
            bgcolor: iconBgColor,
            color: 'white',
            borderRadius: '50%',
            p: 1.2,
            mb: 1.5,
            display: 'flex',
          }}
        >
          {icon}
        </Box>
        <Typography component="h1" variant="h5" fontWeight={700}>
          {title}
        </Typography>
      </Box>
      {children}
    </Paper>
  </Box>
)

export default AuthFormCard
