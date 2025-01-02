import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { CircularProgress, Container, Typography } from '@mui/material';

const Callback: React.FC = () => {
  const location = useLocation();
  const { handleAuthCallback } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestToken = params.get('request_token');

    if (requestToken) {
      handleAuthCallback(requestToken);
    }
  }, [location, handleAuthCallback]);

  return (
    <Container sx={{ mt: 4, textAlign: 'center' }}>
      <CircularProgress />
      <Typography variant="h6" sx={{ mt: 2 }}>
        Completing authentication...
      </Typography>
    </Container>
  );
};

export default Callback; 