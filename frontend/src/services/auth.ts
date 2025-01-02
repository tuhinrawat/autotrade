import api from './api';
import { AUTH_CONFIG } from '../config/auth';
import { useDispatch } from 'react-redux';
import { setUser, setAuthenticated } from '../redux/authSlice';
import { useNavigate } from 'react-router-dom';

interface AuthCredentials {
  apiKey?: string;
  apiSecret?: string;
}

interface AuthResponse {
  accessToken: string;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    balance?: number;
  };
}

class AuthService {
  private credentials: AuthCredentials = {};

  constructor() {
    // Try to load saved credentials
    this.loadCredentials();
  }

  private loadCredentials() {
    const savedApiKey = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.API_KEY);
    const savedApiSecret = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.API_SECRET);

    this.credentials = {
      apiKey: savedApiKey || AUTH_CONFIG.DEFAULT_API_KEY,
      apiSecret: savedApiSecret || AUTH_CONFIG.DEFAULT_API_SECRET
    };
  }

  public setCredentials(credentials: AuthCredentials) {
    this.credentials = credentials;
    
    // Save credentials if provided
    if (credentials.apiKey) {
      localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.API_KEY, credentials.apiKey);
    }
    if (credentials.apiSecret) {
      localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.API_SECRET, credentials.apiSecret);
    }
  }

  public async login(): Promise<{ loginUrl: string }> {
    try {
      if (!this.credentials.apiKey) {
        throw new Error('API Key is required for login');
      }

      const response = await api.get<{ loginUrl: string }>(AUTH_CONFIG.ENDPOINTS.LOGIN, {
        params: { apiKey: this.credentials.apiKey }
      });

      return response.data;
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.response?.data?.message || 'Failed to initiate login');
    }
  }

  public async handleCallback(requestToken: string): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>(AUTH_CONFIG.ENDPOINTS.CALLBACK, {
        request_token: requestToken,
        api_key: this.credentials.apiKey,
        timestamp: Date.now()
      });

      if (response.data) {
        // Store tokens
        localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.ACCESS_TOKEN, response.data.accessToken);
        localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.JWT_TOKEN, response.data.token);
        localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.LAST_LOGIN, Date.now().toString());
      }

      return response.data;
    } catch (error) {
      console.error('Callback error:', error);
      throw error;
    }
  }

  public async validateSession(): Promise<boolean> {
    try {
      const lastLogin = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.LAST_LOGIN);
      if (!lastLogin) return false;

      const loginTime = new Date(lastLogin).getTime();
      const now = new Date().getTime();
      const daysSinceLogin = (now - loginTime) / (1000 * 60 * 60 * 24);

      if (daysSinceLogin > AUTH_CONFIG.TOKEN_EXPIRY_DAYS) {
        this.clearSession();
        return false;
      }

      const response = await api.get(AUTH_CONFIG.ENDPOINTS.VALIDATE);
      return response.data.valid;
    } catch (error) {
      console.error('Session validation error:', error);
      this.clearSession();
      return false;
    }
  }

  public async getUser(): Promise<AuthResponse['user']> {
    try {
      const response = await api.get(AUTH_CONFIG.ENDPOINTS.USER);
      return response.data;
    } catch (error) {
      console.error('Get user error:', error);
      throw new Error('Failed to fetch user details');
    }
  }

  public clearSession() {
    // Clear all auth-related data from storage
    Object.values(AUTH_CONFIG.STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }
}

export const auth = new AuthService();

// Add hook-based auth functions
export const useAuth = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleAuthCallback = async (requestToken: string) => {
    try {
      const response = await api.post('/auth/callback', {
        requestToken,
        timestamp: Date.now()
      });

      if (response.data.success && response.data.data) {
        const { tokens, user } = response.data.data;
        
        // Store tokens
        localStorage.setItem('kite_access_token', tokens.access);
        localStorage.setItem('jwt_token', tokens.jwt);
        
        // Store user info
        localStorage.setItem('user', JSON.stringify(user));
        
        // Update auth state
        dispatch(setUser(user));
        dispatch(setAuthenticated(true));
        
        navigate('/dashboard');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Callback error:', error);
      navigate('/login');
    }
  };

  return {
    handleAuthCallback
  };
}; 