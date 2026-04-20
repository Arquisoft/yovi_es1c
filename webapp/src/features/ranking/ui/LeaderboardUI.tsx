import { Box, Paper, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useRankingController } from '../hooks/useRankingController';
import { useAuth } from '../../auth';
import StatCard from '../../../components/StatCard';
import { dataGridStyles } from '../../../app/theme/dataGridStyles';
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
              sx={dataGridStyles}
            />
          )}
        </Paper>
      </div>
    </div>
  );
}
