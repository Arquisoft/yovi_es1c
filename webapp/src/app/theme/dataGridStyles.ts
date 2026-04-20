export const dataGridStyles = {
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
} as const;
