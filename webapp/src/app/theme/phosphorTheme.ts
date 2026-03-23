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
    h1: { fontWeight: 400, letterSpacing: '0.12em' },
    h2: { fontWeight: 400, letterSpacing: '0.12em' },
    h3: { fontWeight: 400, letterSpacing: '0.12em' },
    h4: { fontWeight: 400, letterSpacing: '0.12em' },
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
        },
        '*, *::before, *::after': {
          boxSizing: 'border-box',
        },
        body: {
          margin: 0,
          minWidth: '320px',
          minHeight: '100vh',
          backgroundColor: '#031103',
          color: '#9dff95',
          fontFamily: "'VT323', 'Courier New', monospace",
        },
        '#root': {
          minHeight: '100vh',
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
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          textTransform: 'uppercase',
          fontFamily: "'VT323', 'Courier New', monospace",
          fontSize: '1.08rem',
          letterSpacing: '0.18em',
          border: '1px solid rgba(57, 255, 20, 0.38)',
          paddingInline: '1.4rem',
        },
        contained: {
          background: 'linear-gradient(180deg, #61ff42 0%, #39ff14 100%)',
          color: '#031103',
          boxShadow: '0 0 15px rgba(57, 255, 20, 0.42)',
        },
        outlined: {
          color: '#9dff95',
          borderColor: 'rgba(57, 255, 20, 0.45)',
          background: 'rgba(6, 22, 6, 0.75)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-root': {
            fontFamily: "'VT323', 'Courier New', monospace",
            fontSize: '1.12rem',
            borderRadius: 0,
            color: '#9dff95',
            background: 'rgba(5, 18, 5, 0.86)',
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(57, 255, 20, 0.3)',
          },
          '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(57, 255, 20, 0.55)',
          },
          '& .Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#39ff14',
            boxShadow: '0 0 12px rgba(57, 255, 20, 0.18)',
          },
          '& .MuiInputLabel-root': {
            color: 'rgba(157, 255, 149, 0.62)',
            fontFamily: "'VT323', 'Courier New', monospace",
            letterSpacing: '0.08em',
          },
          '& .MuiInputLabel-root.Mui-focused': {
            color: '#9dff95',
          },
          '& .MuiFormHelperText-root': {
            fontFamily: "'VT323', 'Courier New', monospace",
            letterSpacing: '0.05em',
            color: 'rgba(157, 255, 149, 0.56)',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontFamily: "'VT323', 'Courier New', monospace",
          letterSpacing: '0.08em',
          border: '1px solid',
        },
        standardError: {
          background: 'rgba(92, 10, 10, 0.38)',
          color: '#ff8f8f',
          borderColor: 'rgba(255, 95, 95, 0.7)',
        },
        standardSuccess: {
          background: 'rgba(16, 54, 16, 0.48)',
          color: '#9dff95',
          borderColor: 'rgba(57, 255, 20, 0.58)',
        },
      },
    },
    MuiFormControl: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 0,
            fontFamily: "'VT323', 'Courier New', monospace",
            background: 'rgba(5, 18, 5, 0.86)',
            color: '#9dff95',
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(57, 255, 20, 0.3)',
          },
          '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(57, 255, 20, 0.55)',
          },
          '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#39ff14',
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          fontFamily: "'VT323', 'Courier New', monospace",
          fontSize: '1.12rem',
          letterSpacing: '0.08em',
          color: '#9dff95',
        },
        icon: {
          color: '#9dff95',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontFamily: "'VT323', 'Courier New', monospace",
          fontSize: '1.12rem',
          letterSpacing: '0.08em',
          backgroundColor: '#071607',
          color: '#9dff95',
          '&:hover': {
            backgroundColor: 'rgba(57, 255, 20, 0.12)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(57, 255, 20, 0.2)',
          },
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: '#39ff14',
        },
      },
    },
  },
});
