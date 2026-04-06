import { createTheme } from '@mui/material/styles';

export const phosphorTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#39ff14' },
    secondary: { main: '#8cff68' },
    background: {
      default: '#031103',
      paper: 'rgba(4, 18, 4, 0.92)',
    },
    text: {
      primary: '#9dff95',
      secondary: 'rgba(157, 255, 149, 0.7)',
    },
    error: { main: '#ff5f5f' },
    success: { main: '#39ff14' },
    warning: { main: '#e3ff5f' },
    info: { main: '#8cff68' },
  },
  typography: {
    fontFamily: "'VT323', 'Courier New', monospace",
    fontSize: 16,
    h1: { fontWeight: 400, letterSpacing: '0.12em' },
    h2: { fontWeight: 400, letterSpacing: '0.12em' },
    h3: { fontWeight: 400, letterSpacing: '0.12em' },
    h4: {
      fontWeight: 400,
      letterSpacing: '0.12em',
      fontSize: '2.1rem',
      '@media (max-width:600px)': { fontSize: '1.6rem' }
    },
    h5: { fontWeight: 400, letterSpacing: '0.12em' },
    h6: { fontWeight: 400, letterSpacing: '0.12em' },
    button: { fontWeight: 400, letterSpacing: '0.18em' },
  },
  shape: { borderRadius: 0 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: 'dark',
          fontSize: '18px',
          '@media (max-width:600px)': { fontSize: '15px' },
        },
        body: {
          margin: 0,
          minWidth: '320px',
          backgroundColor: '#031103',
          color: '#9dff95',
          fontFamily: "'VT323', 'Courier New', monospace",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          textTransform: 'uppercase',
          fontSize: '1.3rem',
          '@media (max-width:600px)': {
            fontSize: '1rem',
            paddingInline: '1rem',
          },
          letterSpacing: '0.18em',
          border: '1px solid rgba(57, 255, 20, 0.38)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-root': {
            fontSize: '1.4rem',
            '@media (max-width:600px)': { fontSize: '1.1rem' },
            borderRadius: 0,
            background: 'rgba(5, 18, 5, 0.86)',
          },
          '& .MuiInputLabel-root': {
            fontSize: '1.1rem',
            '@media (max-width:600px)': { fontSize: '0.9rem' },
          }
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          fontSize: '1.4rem',
          '@media (max-width:600px)': { fontSize: '1.1rem' },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '1.4rem',
          '@media (max-width:600px)': { fontSize: '1.1rem' },
          backgroundColor: '#071607',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(4, 18, 4, 0.92)',
          border: '1px solid rgba(57, 255, 20, 0.28)',
          boxShadow: '0 0 18px rgba(57, 255, 20, 0.14), inset 0 0 20px rgba(0, 0, 0, 0.42)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          border: '1px solid',
        },
      },
    },
  },
});