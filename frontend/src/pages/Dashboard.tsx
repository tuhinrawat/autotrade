import { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box, 
  Container,
  Grid,
  Paper,
  Typography,
  IconButton, 
  CircularProgress,
  Tooltip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { AccountDetails } from '../types/api.ts';
import { auth, market } from '../services/api.ts';
import { RootState } from '../store/index.ts';
import { updateBalance } from '../store/slices/authSlice.ts';

const REFRESH_INTERVAL = 30000; // 30 seconds

const Dashboard = () => {
  const dispatch = useDispatch();
  const [accountDetails, setAccountDetails] = useState<AccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const [marketStatus, setMarketStatus] = useState({ isOpen: false, lastChecked: '' });
  const [marketCheckError, setMarketCheckError] = useState<string | null>(null);

  const fetchAccountDetails = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const details = await auth.getAccountDetails();
      setAccountDetails(details);
      if (details?.balance !== undefined) {
        dispatch(updateBalance(details.balance));
      }
      console.log('Account details updated:', details);
    } catch (err) {
      console.error('Error fetching account details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch account details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dispatch]);

  // Initial fetch
  useEffect(() => {
    if (isAuthenticated) {
      fetchAccountDetails();
    }
  }, [isAuthenticated, fetchAccountDetails]);

  // Auto-refresh setup
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(() => {
      fetchAccountDetails(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [isAuthenticated, fetchAccountDetails]);

  // Check market status
  const checkMarketStatus = useCallback(async () => {
    try {
      const data = await market.getStatus();
      setMarketStatus({
        isOpen: data.isOpen,
        lastChecked: data.timestamp
      });
      setMarketCheckError(null);
    } catch (error) {
      console.error('Error checking market status:', error);
      setMarketCheckError(error instanceof Error ? error.message : 'Failed to check market status');
    }
  }, []);

  // Poll market status every 5 seconds
  useEffect(() => {
    if (!isAuthenticated) return;
    
    checkMarketStatus();
    const interval = setInterval(checkMarketStatus, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, checkMarketStatus]);

  const handleManualRefresh = () => {
    if (!refreshing) {
      fetchAccountDetails(true);
    }
  };

  if (!isAuthenticated) {
    return (
      <Container>
        <Typography variant="h5" sx={{ mt: 4 }}>
          Please log in to view your dashboard
        </Typography>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container>
        <Typography variant="h5" sx={{ mt: 4 }}>
          Loading account details...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Typography variant="h5" color="error" sx={{ mt: 4 }}>
          Error: {error}
        </Typography>
      </Container>
    );
  }

  if (!accountDetails) {
    return (
      <Container>
        <Typography variant="h5" sx={{ mt: 4 }}>
          No account details available
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {/* Market Status */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ 
              width: 12, 
              height: 12, 
              borderRadius: '50%',
              backgroundColor: marketStatus.isOpen ? 'success.main' : 'error.main',
              animation: marketStatus.isOpen ? 'pulse 2s infinite' : 'none',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.5 },
                '100%': { opacity: 1 },
              }
            }} />
            <Typography>
              Market is {marketStatus.isOpen ? 'Open' : 'Closed'}
              {marketStatus.lastChecked && ` (Last checked: ${new Date(marketStatus.lastChecked).toLocaleTimeString()})`}
            </Typography>
            {marketCheckError && (
              <Typography color="error" variant="caption">
                {marketCheckError}
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* User Details */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, position: 'relative' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                User Details
              </Typography>
              <Tooltip title="Refresh Data">
                <IconButton 
                  onClick={handleManualRefresh} 
                  disabled={refreshing}
                  size="small"
                >
                  {refreshing ? (
                    <CircularProgress size={20} />
                  ) : (
                    <RefreshIcon />
                  )}
                </IconButton>
              </Tooltip>
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    User ID
                  </Typography>
                  <Typography variant="body1">
                    {accountDetails?.user_id}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    User Name
                  </Typography>
                  <Typography variant="body1">
                    {accountDetails?.user_name}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Email
                  </Typography>
                  <Typography variant="body1">
                    {accountDetails?.email}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    User Type
                  </Typography>
                  <Typography variant="body1">
                    {accountDetails?.user_type}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Account Overview */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Account Overview
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                Last updated: {new Date().toLocaleTimeString()}
              </Typography>
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Available Balance
                  </Typography>
                  <Typography variant="h6">
                    ₹{(accountDetails?.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Used Margin
                  </Typography>
                  <Typography variant="h6">
                    ₹{(accountDetails?.margins?.used?.exposure || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    M2M
                  </Typography>
                  <Typography variant="h6" color={accountDetails?.margins?.used?.m2m && accountDetails.margins.used.m2m < 0 ? 'error.main' : 'success.main'}>
                    ₹{(accountDetails?.margins?.used?.m2m || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Collateral
                  </Typography>
                  <Typography variant="h6">
                    ₹{(accountDetails?.margins?.available?.collateral || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Additional Margin Details */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Margin Details
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1" gutterBottom>
                  Available Margins
                </Typography>
                <Box sx={{ '& > *': { mb: 1 } }}>
                  <Typography>
                    Cash: ₹{(accountDetails?.margins?.available?.cash || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                  <Typography>
                    Intraday Payin: ₹{(accountDetails?.margins?.available?.intraday_payin || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1" gutterBottom>
                  Used Margins
                </Typography>
                <Box sx={{ '& > *': { mb: 1 } }}>
                  <Typography>
                    Debits: ₹{(accountDetails?.margins?.used?.debits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                  <Typography>
                    Span: ₹{(accountDetails?.margins?.used?.span || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                  <Typography>
                    Option Premium: ₹{(accountDetails?.margins?.used?.option_premium || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                  <Typography>
                    Holding Sales: ₹{(accountDetails?.margins?.used?.holding_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                  <Typography>
                    Turnover: ₹{(accountDetails?.margins?.used?.turnover || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard; 