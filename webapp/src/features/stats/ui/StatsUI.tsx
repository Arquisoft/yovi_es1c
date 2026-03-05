import { Box, Typography, Paper, Card, CardContent, Stack } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

export default function StatsUI() {

    // DATOS MOCK SOLO PARA UI
    const stats = {
        totalMatches: 12,
        wins: 7,
        losses: 5,
        matches: [
            { matchId: "1", createdAt: "2026-03-01", mode: "BOT", status: "win" },
            { matchId: "2", createdAt: "2026-03-02", mode: "BOT", status: "lose" },
            { matchId: "3", createdAt: "2026-03-03", mode: "LOCAL_2P", status: "win" },
            { matchId: "4", createdAt: "2026-03-04", mode: "BOT", status: "lose" },
            { matchId: "5", createdAt: "2026-03-05", mode: "LOCAL_2P", status: "win" }
        ]
    };

    const winrate = stats.totalMatches
        ? ((stats.wins / stats.totalMatches) * 100).toFixed(1)
        : 0;

    const columns = [
        {
            field: "createdAt",
            headerName: "Fecha",
            flex: 1,
            valueGetter: (value: any, row: any) =>
                new Date(row.createdAt).toLocaleDateString(),
        },
        { field: "mode", headerName: "Modo", flex: 1 },
        { field: "status", headerName: "Resultado", flex: 1 },
        { field: "matchId", headerName: "Match ID", flex: 2 },
    ];

    return (
        <Box
            sx={{
                minHeight: "100vh",
                background: "linear-gradient(180deg,#020617,#020617,#0f172a)",
                p: 4
            }}
        >
            <Box maxWidth={1100} mx="auto">

                <Typography
                    variant="h3"
                    sx={{
                        textAlign: "center",
                        color: "#fff",
                        textShadow: "0 0 5px #00fff7, 0 0 10px #ff00d4",
                        mb: 4
                    }}
                >
                    📊 Estadísticas del jugador
                </Typography>

                <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={3}
                    justifyContent="center"
                    mb={5}
                >
                    <StatCard title="Partidas jugadas" value={stats.totalMatches} color="#00fff7"/>
                    <StatCard title="Victorias" value={stats.wins} color="#00ff88"/>
                    <StatCard title="Derrotas" value={stats.losses} color="#ff3b3b"/>
                    <StatCard title="Winrate" value={`${winrate}%`} color="#ff00d4"/>
                </Stack>

                <Paper
                    sx={{
                        p:2,
                        bgcolor: "rgba(0,0,0,0.7)",
                        border: "1px solid #00fff7",
                        boxShadow: "0 0 15px #00fff7"
                    }}
                >
                    <Typography
                        variant="h6"
                        sx={{ color:"#fff", mb:2 }}
                    >
                        Historial de partidas
                    </Typography>

                    <DataGrid
                        rows={stats.matches}
                        columns={columns}
                        getRowId={(row) => row.matchId}
                        autoHeight
                        pageSizeOptions={[5,10,25]}
                        initialState={{
                            pagination: {
                                paginationModel: { pageSize: 5, page: 0 }
                            }
                        }}
                        sx={{
                            border: "none",
                            color: "#e5e7eb",

                            backgroundColor: "rgba(2,6,23,0.8)",

                            "& .MuiDataGrid-columnHeaders": {
                                backgroundColor: "#020617",
                                color: "#00fff7",
                                borderBottom: "1px solid #00fff7",
                                fontSize: "14px",
                            },

                            "& .MuiDataGrid-cell": {
                                borderBottom: "1px solid rgba(255,255,255,0.05)",
                            },

                            "& .MuiDataGrid-row": {
                                backgroundColor: "rgba(15,23,42,0.6)",
                            },

                            "& .MuiDataGrid-row:hover": {
                                backgroundColor: "rgba(0,255,247,0.1)",
                            },

                            "& .MuiDataGrid-footerContainer": {
                                backgroundColor: "#020617",
                                borderTop: "1px solid #00fff7",
                            },

                            "& .MuiTablePagination-root": {
                                color: "#fff",
                            },

                            "& .MuiSvgIcon-root": {
                                color: "#00fff7",
                            },
                        }}
                    />
                </Paper>

            </Box>
        </Box>
    );
}

function StatCard({ title, value, color }: any) {
    return (
        <Card
            sx={{
                minWidth: 200,
                bgcolor: "rgba(0,0,0,0.7)",
                border: `1px solid ${color}`,
                boxShadow: `0 0 12px ${color}`,
            }}
        >
            <CardContent sx={{ textAlign: "center" }}>
                <Typography variant="subtitle2" color="#aaa">
                    {title}
                </Typography>

                <Typography
                    variant="h4"
                    sx={{
                        color,
                        textShadow: `0 0 10px ${color}`,
                        fontWeight: "bold"
                    }}
                >
                    {value}
                </Typography>
            </CardContent>
        </Card>
    );
}