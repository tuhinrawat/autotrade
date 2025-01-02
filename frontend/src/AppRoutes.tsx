import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Trade from './pages/Trade';
import Logs from './pages/Logs';
import Landing from './pages/Landing';
import Callback from './pages/Callback';
import PrivateRoute from './components/PrivateRoute';
import { useSelector } from 'react-redux';
import type { RootState } from './store';

const AppRoutes = () => {
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);

  return (
    <Routes>
      <Route path="/" element={
        isAuthenticated ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <Landing />
        )
      } />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/callback" element={<Callback />} />
      <Route element={<Layout><Outlet /></Layout>}>
        <Route path="dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="trade" element={<PrivateRoute><Trade /></PrivateRoute>} />
        <Route path="logs" element={<PrivateRoute><Logs /></PrivateRoute>} />
      </Route>
    </Routes>
  );
};

export default AppRoutes; 