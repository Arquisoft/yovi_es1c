import { Box, Typography, Paper, Card, CardContent, Stack } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { useStatsController } from "../hooks/useStatsController";

export default function StatsUI() {

    const userId = localStorage.getItem("userId") || "";

    const { state } = useStatsController(userId);
    const { stats, loading, error } = state;

    if (loading) {
        return (
            <Typography color="white" textAlign="center" mt={10}>
                Cargando estadísticas...
            </Typography>
        );
    }

    if (error) {
        return (
            <Typography color="red" textAlign="center" mt={10}>
                {error}
            </Typography>
        );
    }

    if (!stats) return null;

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
    ];

    return (
        <Box
            sx={{
                position: "absolute",
                top: 70,
                left: 0,
                right: 0,
                minHeight: "calc(100vh - 70px)",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                p: 2,
                pt: 6,
                overflow: "auto",
                background: "linear-gradient(180deg,#100010,#050005,#000000)",
            }}
        >
            <Box maxWidth={1100} width="100%">
                <Typography
                    variant="h3"
                    sx={{
                        textAlign: "center",
                        color: "#00bfff",
                        textShadow: "0 0 5px #00bfff, 0 0 10px #004080",
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
                            backgroundColor: "rgba(2,6,23,0.9)",

                            /* HEADER CON FONDO OSCURO REAL */
                            "& .MuiDataGrid-columnHeaders": {
                                backgroundColor: "#020617 !important",
                                borderBottom: "2px solid #00fff7",
                            },

                            "& .MuiDataGrid-columnHeader": {
                                backgroundColor: "#020617 !important",
                                color: "#00fff7",
                                fontWeight: "bold",
                                letterSpacing: "1px",
                                textTransform: "uppercase",
                            },

                            "& .MuiDataGrid-columnHeaderTitle": {
                                fontWeight: 700,
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