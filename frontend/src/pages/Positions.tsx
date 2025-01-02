import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Positions: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Positions
      </Typography>
      <Paper sx={{ p: 2 }}>
        <Typography>
          Current positions will be displayed here.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Positions; 