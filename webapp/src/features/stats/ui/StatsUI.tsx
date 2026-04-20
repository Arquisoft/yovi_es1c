import { Box, Paper, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useStatsController } from '../hooks/useStatsController';
import { useAuth } from '../../auth';
import StatCard from '../../../components/StatCard';
import { dataGridStyles } from '../../../app/theme/dataGridStyles';
import styles from './StatsUI.module.css';
import { useTranslation } from 'react-i18next';


export default function StatsUI() {
  const { user } = useAuth();
  const userId = user?.id != null ? String(user.id) : '';
  const { state } = useStatsController(userId);
  const { stats, loading, error } = state;
  const {t, i18n} = useTranslation();


  if (loading) {
    return (
      <Typography color="text.primary" textAlign="center" mt={10}>
          {t('loadingStats')}...
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

  if (!stats) return null;

  const matches = stats.matches ?? [];
  const winrate = stats.totalMatches ? ((stats.wins / stats.totalMatches) * 100).toFixed(1) : 0;

  const columns = [
  {
    field: 'createdAt',
    headerName: t('date'),
    flex: 1,
    valueFormatter: (value: any) => {
      if (!value) return t('nA');

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return t('nA');

      return date.toLocaleString(i18n.language, {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
  },
  {
    field: 'mode',
    headerName: t('mode'),
    flex: 1,
  },
  {
    field: 'status',
    headerName: t('result'),
    flex: 1,
  },
];

  return (
    <div className={styles.container}>
      <div style={{ maxWidth: 1120, width: '100%' }}>
        <Typography variant="h3" className={styles.header}>
          {t('playerStats')}
        </Typography>
        <Typography className={`${styles.subheader} crt-blink`}>
          {t('performanceMonitor')}
        </Typography>

<Box className={styles.statGrid}>
          <StatCard title= {t('matchPlayed')} value={stats.totalMatches} />
          <StatCard title={t('wins')} value={stats.wins} />
          <StatCard title={t('losses')} value={stats.losses} />
          <StatCard title={t('winrate')} value={`${winrate}%`} />
        </Box>

        <Paper className={styles.paper}>
          <Typography variant="h6" className="crt-heading" sx={{ mb: 2 }}>
            {t('matchHistory')}
          </Typography>

          {matches.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={4}>
              {t('noMatchesRegistered')}
            </Typography>
          ) : (
            <DataGrid
              rows={matches}
              columns={columns}
              getRowId={(row: any) => row.matchId}
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
