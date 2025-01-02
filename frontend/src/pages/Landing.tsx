import { Box, Button, Container, Typography, Grid, Paper } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SecurityIcon from '@mui/icons-material/Security';
import SpeedIcon from '@mui/icons-material/Speed';

const Landing = () => {
  const handleLaunchKite = () => {
    const apiKey = import.meta.env.VITE_KITE_API_KEY;
    if (!apiKey) {
      console.error('Kite API key not found in environment variables');
      return;
    }

    // Construct the Kite login URL
    const baseUrl = 'https://kite.zerodha.com/connect/login';
    const params = new URLSearchParams({
      api_key: apiKey,
      v: '3',
      redirect_url: import.meta.env.VITE_KITE_REDIRECT_URL || 'http://localhost:5173/callback'
    });

    // Redirect to Kite login
    window.location.href = `${baseUrl}?${params.toString()}`;
  };

  return (
    <Box sx={{ 
      minHeight: '100vh',
      width: '100vw',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      background: 'linear-gradient(45deg, #1a237e 30%, #0d47a1 90%)',
      color: 'white',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Hero Section */}
      <Container maxWidth={false} sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
          py: { xs: 4, md: 8 }
        }}>
          <Typography 
            variant="h2" 
            component="h1" 
            gutterBottom 
            sx={{ 
              fontWeight: 700,
              fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4rem' }
            }}
          >
            Professional Trading Platform
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              mb: 6, 
              opacity: 0.8,
              maxWidth: '800px',
              px: 2,
              fontSize: { xs: '1.2rem', sm: '1.5rem' }
            }}
          >
            Connect with Zerodha Kite and start trading with advanced analytics and real-time data
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={handleLaunchKite}
            sx={{
              py: { xs: 1.5, md: 2 },
              px: { xs: 4, md: 6 },
              fontSize: { xs: '1rem', md: '1.2rem' },
              background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
              '&:hover': {
                background: 'linear-gradient(45deg, #1976D2 30%, #00BCD4 90%)',
              },
              boxShadow: '0 3px 5px 2px rgba(33, 203, 243, .3)',
              borderRadius: '30px'
            }}
          >
            Launch Kite
          </Button>
        </Box>

        {/* Features Section */}
        <Grid 
          container 
          spacing={{ xs: 2, md: 4 }} 
          sx={{ 
            py: { xs: 4, md: 8 },
            px: { xs: 2, md: 4 }
          }}
        >
          <Grid item xs={12} md={4}>
            <Paper 
              elevation={0}
              sx={{ 
                p: { xs: 3, md: 4 }, 
                height: '100%', 
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                transition: 'transform 0.3s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-5px)'
                }
              }}
            >
              <TrendingUpIcon sx={{ fontSize: { xs: 32, md: 40 }, mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Advanced Analytics
              </Typography>
              <Typography>
                Get real-time market insights and advanced trading analytics to make informed decisions.
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper 
              elevation={0}
              sx={{ 
                p: { xs: 3, md: 4 }, 
                height: '100%', 
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                transition: 'transform 0.3s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-5px)'
                }
              }}
            >
              <SecurityIcon sx={{ fontSize: { xs: 32, md: 40 }, mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Secure Trading
              </Typography>
              <Typography>
                Industry-standard security measures to protect your trades and sensitive information.
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper 
              elevation={0}
              sx={{ 
                p: { xs: 3, md: 4 }, 
                height: '100%', 
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                transition: 'transform 0.3s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-5px)'
                }
              }}
            >
              <SpeedIcon sx={{ fontSize: { xs: 32, md: 40 }, mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Fast Execution
              </Typography>
              <Typography>
                Lightning-fast order execution and real-time portfolio updates.
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Landing; 