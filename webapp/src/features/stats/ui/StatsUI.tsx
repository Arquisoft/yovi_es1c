import { Box, Card, CardContent, Paper, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { useStatsController } from '../hooks/useStatsController';
import { useAuth } from '../../auth';
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

function StatCard({ title, value }: { title: string; value: string | number }) {
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
