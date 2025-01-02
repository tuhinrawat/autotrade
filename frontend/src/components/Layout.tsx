import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  AppBar,
  Box,
  Toolbar,
  IconButton,
  Typography,
  Button,
  Container,
  Menu,
  MenuItem,
} from '@mui/material';
import { AccountCircle } from '@mui/icons-material';
import { RootState } from '../store/index.ts';
import { logout } from '../store/slices/authSlice.ts';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    dispatch(logout());
    handleClose();
    navigate('/', { replace: true });
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      minHeight: '100vh',
      width: '100vw',
      margin: 0,
      padding: 0,
      overflow: 'hidden'
    }}>
      <AppBar position="static">
        <Toolbar>
          <Typography
            variant="h6"
            component="div"
            sx={{ flexGrow: 1, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            Trading App
          </Typography>

          {isAuthenticated ? (
            <>
              <Button
                color="inherit"
                onClick={() => navigate('/dashboard')}
                sx={{ mr: 2 }}
              >
                Dashboard
              </Button>
              <Button
                color="inherit"
                onClick={() => navigate('/trade')}
                sx={{ mr: 2 }}
              >
                Trade
              </Button>
              <Button
                color="inherit"
                onClick={() => navigate('/logs')}
                sx={{ mr: 2 }}
              >
                Logs
              </Button>
              <Typography variant="h6" component="div" sx={{ flexGrow: 0, mr: 2 }}>
                Balance: ₹{(user?.balance || 0).toFixed(2)}
              </Typography>
              <IconButton
                size="large"
                onClick={handleMenu}
                color="inherit"
              >
                <AccountCircle />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
              >
                <MenuItem onClick={handleLogout}>Logout</MenuItem>
              </Menu>
            </>
          ) : (
            location.pathname !== '/login' && (
              <Button color="inherit" onClick={() => navigate('/login')}>
                Login
              </Button>
            )
          )}
        </Toolbar>
      </AppBar>

      <Container 
        component="main" 
        maxWidth={false} 
        sx={{ 
          mt: 0, 
          mb: 0, 
          flex: 1,
          p: 0,
          height: 'calc(100vh - 64px - 56px)', // Subtracting AppBar and Footer heights
          overflow: 'auto'
        }}
      >
        {children}
      </Container>

      <Box
        component="footer"
        sx={{
          py: 2,
          px: 2,
          mt: 'auto',
          backgroundColor: (theme) => theme.palette.background.paper,
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Typography variant="body2" color="text.secondary" align="center">
          © {new Date().getFullYear()} Trading App. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
};

export default Layout; 