import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { loginSuccess } from '../store/slices/authSlice';
import { auth } from '../services/api';
import { Box, CircularProgress, Typography } from '@mui/material';

const Callback: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get request token from URL
        const params = new URLSearchParams(location.search);
        const requestToken = params.get('request_token');
        const status = params.get('status');

        if (!requestToken || status !== 'success') {
          throw new Error('Invalid callback parameters');
        }

        // Process the callback
        const response = await auth.handleCallback(requestToken);
        
        // Update Redux store
        dispatch(loginSuccess({
          accessToken: response.accessToken,
          token: response.token
        }));

        // Redirect to dashboard
        navigate('/dashboard');
      } catch (error) {
        console.error('Error in callback:', error);
        navigate('/login');
      }
    };

    handleCallback();
  }, [location, navigate, dispatch]);

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh'
    }}>
      <CircularProgress />
      <Typography variant="h6" sx={{ mt: 2 }}>
        Completing authentication...
      </Typography>
    </Box>
  );
};

export default Callback; 