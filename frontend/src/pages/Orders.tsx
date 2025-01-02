import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Orders: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Orders
      </Typography>
      <Paper sx={{ p: 2 }}>
        <Typography>
          Order history will be displayed here.
        </Typography>
      </Paper>
    </Box>
  );
};

export default Orders; 