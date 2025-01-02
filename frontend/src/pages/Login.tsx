import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginStart, loginFailure } from '../store/slices/authSlice';
import { auth } from '../services/auth';
import { AUTH_CONFIG } from '../config/auth';
import { RootState } from '../store';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  CircularProgress,
  Collapse,
  Alert,
  IconButton
} from '@mui/material';
import { ExpandMore, Close } from '@mui/icons-material';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [credentials, setCredentials] = useState({
    apiKey: '',
    apiSecret: ''
  });

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (isAuthenticated) {
      navigate(AUTH_CONFIG.REDIRECT_URLS.AFTER_LOGIN, { replace: true });
      return;
    }

    // Check if we have default credentials
    const hasDefaultCredentials = AUTH_CONFIG.DEFAULT_API_KEY && AUTH_CONFIG.DEFAULT_API_SECRET;
    if (!hasDefaultCredentials) {
      setShowManualInput(true);
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      dispatch(loginStart());

      // If using manual input, set the credentials
      if (showManualInput) {
        if (!credentials.apiKey || !credentials.apiSecret) {
          throw new Error('Please enter both API Key and API Secret');
        }
        auth.setCredentials(credentials);
      }

      // Get login URL and redirect
      const { loginUrl } = await auth.login();
      window.location.href = loginUrl;
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Failed to initiate login');
      dispatch(loginFailure(error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default'
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
        <CardContent>
          <Typography variant="h5" component="h1" gutterBottom align="center">
            Login with Zerodha
          </Typography>

          {error && (
            <Alert 
              severity="error" 
              sx={{ mb: 2 }}
              action={
                <IconButton size="small" onClick={() => setError(null)}>
                  <Close fontSize="small" />
                </IconButton>
              }
            >
              {error}
            </Alert>
          )}

          <Box sx={{ mb: 2 }}>
            <Button
              variant="text"
              endIcon={<ExpandMore />}
              onClick={() => setShowManualInput(!showManualInput)}
              sx={{ mb: 1 }}
            >
              {showManualInput ? 'Hide API Credentials' : 'Enter API Credentials'}
            </Button>

            <Collapse in={showManualInput}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="API Key"
                  value={credentials.apiKey}
                  onChange={(e) => setCredentials(prev => ({ ...prev, apiKey: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="API Secret"
                  type="password"
                  value={credentials.apiSecret}
                  onChange={(e) => setCredentials(prev => ({ ...prev, apiSecret: e.target.value }))}
                  fullWidth
                />
              </Box>
            </Collapse>
          </Box>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            onClick={handleLogin}
            disabled={loading || (showManualInput && (!credentials.apiKey || !credentials.apiSecret))}
          >
            {loading ? <CircularProgress size={24} /> : 'Login with Zerodha'}
          </Button>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
            {showManualInput ? 
              'Enter your Zerodha API credentials to continue' :
              'Click to login with your Zerodha account'
            }
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login; 