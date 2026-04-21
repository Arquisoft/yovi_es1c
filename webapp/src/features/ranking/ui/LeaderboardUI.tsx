import { Box, Paper, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useTranslation } from 'react-i18next';
import { useRankingController } from '../hooks/useRankingController';
import { useAuth } from '../../auth';
import StatCard from '../../../components/StatCard';
import { dataGridStyles } from '../../../app/theme/dataGridStyles';
import styles from './LeaderboardUI.module.css';

export default function LeaderboardUI() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { state } = useRankingController({ userId });
  const { leaderboard, userRanking, loading, error } = state;

  if (loading) {
    return (
        <Typography color="text.primary" textAlign="center" mt={10}>
          {t('ranking.loading')}
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
      headerName: t('ranking.columns.player'),
      flex: 1,
      valueGetter: (_value: any, row: any) => row.username ?? `#${row.userId}`,
    },
    { field: 'eloRating', headerName: t('ranking.columns.elo'), flex: 1 },
    { field: 'gamesPlayed', headerName: t('ranking.columns.gamesPlayed'), flex: 1 },
    { field: 'peakRating', headerName: t('ranking.columns.peak'), flex: 1 },
    {
      field: 'lastUpdated',
      headerName: t('ranking.columns.updatedAt'),
      flex: 1.2,
      valueFormatter: (value: any) => {
        if (!value) return t('nA');
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? t('nA') : date.toLocaleString();
      },
    },
  ];

  return (
      <div className={styles.container}>
        <div style={{ maxWidth: 1120, width: '100%' }}>
          <Typography variant="h3" className={styles.header}>
            {t('ranking.title')}
          </Typography>
          <Typography className={`${styles.subheader} crt-blink`}>{t('ranking.subtitle')}</Typography>

          <Box className={styles.statGrid}>
            <StatCard title={t('ranking.stats.players')} value={leaderboard.total} />
            <StatCard title={t('ranking.stats.position')} value={userRanking ? `#${userRanking.rank}` : '—'} />
            <StatCard title={t('ranking.stats.elo')} value={userRanking?.eloRating ?? '—'} />
            <StatCard title={t('ranking.stats.peak')} value={userRanking?.peakRating ?? '—'} />
          </Box>

          <Paper className={styles.paper}>
            <Typography variant="h6" className="crt-heading" sx={{ mb: 2 }}>
              {t('ranking.topPlayers')}
            </Typography>

            {entries.length === 0 ? (
                <Typography color="text.secondary" textAlign="center" py={4}>
                  {t('ranking.empty')}
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