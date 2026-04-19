import { Box, Card, CardContent, Paper, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useRankingController } from '../hooks/useRankingController';
import { useAuth } from '../../auth';
import styles from './LeaderboardUI.module.css';

export default function LeaderboardUI() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { state } = useRankingController({ userId });
  const { leaderboard, userRanking, loading, error } = state;

  if (loading) {
    return (
      <Typography color="text.primary" textAlign="center" mt={10}>
        Cargando ranking...
      </Typography>
    );
  }

  if (error) {
    return (
      <Typography color="error.main" textAlign="center" mt={10}>
        {error}
      </Typography>
    );
  }

  if (!leaderboard) return null;

  const entries = leaderboard.entries ?? [];

  const columns = [
    { field: 'rank', headerName: '#', width: 80 },
    {
      field: 'username',
      headerName: 'Jugador',
      flex: 1,
      valueGetter: (_value: any, row: any) => row.username ?? `#${row.userId}`,
    },
    { field: 'eloRating', headerName: 'ELO', flex: 1 },
    { field: 'gamesPlayed', headerName: 'Partidas', flex: 1 },
    { field: 'peakRating', headerName: 'Pico', flex: 1 },
    {
      field: 'lastUpdated',
      headerName: 'Actualizado',
      flex: 1.2,
      valueFormatter: (value: any) => {
        if (!value) return 'N/A';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
      },
    },
  ];

  return (
    <div className={styles.container}>
      <div style={{ maxWidth: 1120, width: '100%' }}>
        <Typography variant="h3" className={styles.header}>
          Ranking global
        </Typography>
        <Typography className={`${styles.subheader} crt-blink`}>tabla elo de la temporada</Typography>

<Box className={styles.statGrid}>
          <StatCard title="Jugadores" value={leaderboard.total} />
          <StatCard title="Tu posición" value={userRanking ? `#${userRanking.rank}` : '—'} />
          <StatCard title="Tu ELO" value={userRanking?.eloRating ?? '—'} />
          <StatCard title="Tu pico" value={userRanking?.peakRating ?? '—'} />
        </Box>

        <Paper className={styles.paper}>
          <Typography variant="h6" className="crt-heading" sx={{ mb: 2 }}>
            Top jugadores
          </Typography>

          {entries.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={4}>
              No hay partidas registradas todavía
            </Typography>
          ) : (
            <DataGrid
              rows={entries}
              columns={columns}
              getRowId={(row: any) => row.userId}
              autoHeight
              pageSizeOptions={[5, 10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 5, page: 0 } } }}
              sx={{
                border: 'none',
                color: '#9dff95',
                backgroundColor: 'transparent',
                fontFamily: "'VT323', 'Courier New', monospace",
                fontSize: '1rem',
                letterSpacing: '0.08em',
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: 'rgba(2, 11, 2, 0.96) !important',
                  borderBottom: '1px solid rgba(57, 255, 20, 0.3)',
                },
                '& .MuiDataGrid-columnHeader': {
                  backgroundColor: 'transparent !important',
                  color: 'rgba(157, 255, 149, 0.72)',
                  textTransform: 'uppercase',
                },
                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid rgba(57, 255, 20, 0.08)',
                },
                '& .MuiDataGrid-row:hover': {
                  backgroundColor: 'rgba(57, 255, 20, 0.06)',
                },
                '& .MuiDataGrid-footerContainer': {
                  borderTop: '1px solid rgba(57, 255, 20, 0.18)',
                  color: 'rgba(157, 255, 149, 0.62)',
                },
                '& .MuiTablePagination-root': {
                  color: 'rgba(157, 255, 149, 0.62)',
                  fontFamily: "'VT323', 'Courier New', monospace",
                },
                '& .MuiSvgIcon-root': {
                  color: 'rgba(157, 255, 149, 0.62)',
                },
              }}
            />
          )}
        </Paper>
      </div>
    </div>
  );
}

function StatCard({ title, value }: Readonly<{ title: string; value: string | number }>) {
  return (
    <Card
      className="crt-panel"
      sx={{
        minWidth: 200,
        background: 'linear-gradient(180deg, rgba(7, 22, 7, 0.94) 0%, rgba(2, 13, 2, 0.94) 100%)',
      }}
    >
      <CardContent sx={{ textAlign: 'center' }}>
        <Typography className="crt-screen-label" sx={{ mb: 1, fontSize: '0.78rem' }}>
          {title}
        </Typography>
        <Typography variant="h4" className="crt-heading" sx={{ fontSize: '2.2rem' }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
