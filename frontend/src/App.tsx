import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { BrowserRouter as Router } from 'react-router-dom';
import AppRoutes from './AppRoutes.tsx';
import { loginSuccess, logout } from './store/slices/authSlice';
import api from './services/api';

const App: React.FC = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    const validateTokens = async () => {
      const kiteToken = localStorage.getItem('kite_access_token');
      const jwtToken = localStorage.getItem('jwt_token');

      if (!kiteToken || !jwtToken) {
        dispatch(logout());
        return;
      }

      try {
        // Validate tokens with backend
        const response = await api.get('/auth/validate');
        if (response.data.valid) {
          dispatch(loginSuccess({
            accessToken: kiteToken,
            token: jwtToken
          }));
        } else {
          // Clear invalid tokens
          localStorage.removeItem('kite_access_token');
          localStorage.removeItem('jwt_token');
          localStorage.removeItem('last_login');
          dispatch(logout());
        }
      } catch {
        dispatch(logout());
      }
    };

    validateTokens();
  }, [dispatch]);

  return (
    <Router>
      <AppRoutes />
    </Router>
  );
};

export default App;
