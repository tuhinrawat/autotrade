import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Alert,
} from '@mui/material';
import { loginStart } from '../store/slices/authSlice.ts';
import { RootState } from '../store/index.ts';
import { auth } from '../services/api';

const Login = () => {
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state: RootState) => state.auth);
  const [formData, setFormData] = useState({
    apiKey: '',
    apiSecret: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      dispatch(loginStart());
      
      // Store credentials temporarily
      localStorage.setItem('temp_api_key', formData.apiKey);
      localStorage.setItem('temp_api_secret', formData.apiSecret);

      // Get login URL from backend
      const { loginUrl } = await auth.login();
      
      // Redirect to Kite login
      window.location.href = loginUrl;
    } catch (error) {
      console.error('Login error:', error);
      // No need to dispatch loginFailure as the error will be handled by the API interceptor
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          Sign in with Kite
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="apiKey"
            label="API Key"
            name="apiKey"
            autoComplete="off"
            autoFocus
            value={formData.apiKey}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="apiSecret"
            label="API Secret"
            type="password"
            id="apiSecret"
            autoComplete="off"
            value={formData.apiSecret}
            onChange={handleChange}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading}
          >
            {loading ? 'Connecting to Kite...' : 'Connect to Kite'}
          </Button>
          <Typography variant="body2" color="text.secondary" align="center">
            Get your API credentials from the{' '}
            <a href="https://kite.trade/connect/login" target="_blank" rel="noopener noreferrer">
              Kite Connect Developer Console
            </a>
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default Login; 