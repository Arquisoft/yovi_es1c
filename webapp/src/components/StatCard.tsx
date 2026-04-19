import { Card, CardContent, Typography } from '@mui/material';

export default function StatCard({ title, value }: Readonly<{ title: string; value: string | number }>) {
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
