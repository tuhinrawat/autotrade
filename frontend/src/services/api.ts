import axios from 'axios';
import { Instrument } from '../types/api';

interface BacktestParams {
  instrument: Instrument;
  startDate: string;
  endDate: string;
  capital: number;
  strategy: {
    name: string;
    params: Record<string, number | string>;
  };
}

interface BacktestResult {
  trades: Array<{
    date: string;
    type: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    pnl?: number;
  }>;
  metrics: {
    totalTrades: number;
    profitableTrades: number;
    totalPnL: number;
    maxDrawdown: number;
    winRate: number;
  };
}

const API_BASE_URL = 'http://localhost:8000/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth tokens
api.interceptors.request.use(
  (config) => {
    const jwtToken = localStorage.getItem('jwt_token');
    const kiteToken = localStorage.getItem('kite_access_token');

    if (jwtToken) {
      config.headers['Authorization'] = `Bearer ${jwtToken}`;
    }
    if (kiteToken) {
      config.headers['X-Kite-Access-Token'] = kiteToken;
    }

    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    console.error('API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      config: error.config
    });

    if (error.response?.status === 401) {
      // Clear tokens on unauthorized
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('kite_access_token');
      localStorage.removeItem('last_login');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

// Add debounce utility at the top
const debounce = (fn: Function, delay: number) => {
  let timeoutId: number;
  return (...args: any[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const instruments = {
  getAll: async (): Promise<Instrument[]> => {
    console.log('Fetching all instruments...');
    try {
      const cachedData = localStorage.getItem('cached_instruments');
      if (cachedData) {
        const { instruments, timestamp } = JSON.parse(cachedData);
        const cacheAge = Date.now() - timestamp;
        
        // Use cache if less than 24 hours old
        if (cacheAge < 24 * 60 * 60 * 1000) {
          console.log('Using cached instruments:', instruments.length);
          return instruments;
        }
      }

      console.log('Cache invalid or expired, fetching from API...');
      const response = await api.get<Instrument[]>('/instruments');
      console.log('API response received:', response.data.length, 'instruments');

      // Update cache
      localStorage.setItem('cached_instruments', JSON.stringify({
        instruments: response.data,
        timestamp: Date.now()
      }));

      return response.data;
    } catch (error) {
      console.error('Error fetching instruments:', error);
      
      // Try to use cached data as fallback
      const cachedData = localStorage.getItem('cached_instruments');
      if (cachedData) {
        console.log('Using cached data as fallback');
        const { instruments } = JSON.parse(cachedData);
        return instruments;
      }
      
      throw error;
    }
  }
};

export const backtest = {
  run: async (params: BacktestParams): Promise<BacktestResult> => {
    console.log('Running backtest with params:', params);
    try {
      const response = await api.post<BacktestResult>('/backtest', params);
      console.log('Backtest response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Backtest error:', error);
      throw error;
    }
  }
};

export const auth = {
  login: async () => {
    try {
      const response = await api.get('/auth/login');
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
      localStorage.clear();  // Clear all storage
    } catch (error) {
      console.error('Logout error:', error);
      // Clear storage even if API call fails
      localStorage.clear();
      throw error;
    }
  },

  getUser: async () => {
    try {
      const response = await api.get('/auth/user');
      return response.data;
    } catch (error) {
      console.error('Get user error:', error);
      throw error;
    }
  },

  getAccountDetails: async () => {
    try {
      const response = await api.get('/auth/user');
      console.log('Raw user response:', response.data);
      
      // Extract data from the response
      const { user, profile, margins } = response.data;
      
      return {
        user_id: user?.kiteUserId || profile?.user_id || '',
        user_name: profile?.user_name || user?.name || '',
        email: profile?.email || user?.email || '',
        user_type: profile?.user_type || user?.role || '',
        balance: margins?.equity?.available?.cash || 0,
        profile: {
          user_name: profile?.user_name || user?.name || '',
          email: profile?.email || user?.email || '',
          user_type: profile?.user_type || user?.role || '',
          broker: profile?.broker || 'Zerodha',
          exchanges: profile?.exchanges || [],
          products: profile?.products || [],
          order_types: profile?.order_types || []
        },
        margins: {
          available: {
            cash: margins?.equity?.available?.cash || 0,
            collateral: margins?.equity?.available?.collateral || 0,
            intraday_payin: margins?.equity?.available?.intraday_payin || 0
          },
          used: {
            debits: margins?.equity?.used?.debits || 0,
            exposure: margins?.equity?.used?.exposure || 0,
            m2m: margins?.equity?.used?.m2m || 0,
            option_premium: margins?.equity?.used?.option_premium || 0,
            span: margins?.equity?.used?.span || 0,
            holding_sales: margins?.equity?.used?.holding_sales || 0,
            turnover: margins?.equity?.used?.turnover || 0
          }
        }
      };
    } catch (error) {
      console.error('Get account details error:', error);
      throw error;
    }
  },

  handleCallback: async (requestToken: string) => {
    try {
      // Check if we've recently handled this token
      const lastHandledToken = localStorage.getItem('last_handled_token');
      const lastHandledTime = localStorage.getItem('last_handled_time');
      
      if (lastHandledToken === requestToken && lastHandledTime) {
        const timeSinceLastHandle = Date.now() - parseInt(lastHandledTime);
        if (timeSinceLastHandle < 5000) { // Within 5 seconds
          console.log('Duplicate callback request detected, using stored tokens');
          return {
            accessToken: localStorage.getItem('kite_access_token'),
            token: localStorage.getItem('jwt_token')
          };
        }
      }

      // Store current token handling
      localStorage.setItem('last_handled_token', requestToken);
      localStorage.setItem('last_handled_time', Date.now().toString());

      // Get API key and secret from environment
      const apiKey = import.meta.env.VITE_KITE_API_KEY;
      const apiSecret = import.meta.env.VITE_KITE_API_SECRET;

      if (!apiKey || !apiSecret) {
        throw new Error('Missing API key or secret');
      }

      // Add timestamp to check token freshness
      const tokenTimestamp = Date.now();

      console.log('Sending callback request with token:', {
        tokenLength: requestToken.length,
        timestamp: tokenTimestamp,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret
      });

      // Send all required parameters
      const response = await api.post('/auth/callback', {
        requestToken,
        apiKey,
        apiSecret,
        timestamp: tokenTimestamp
      });
      
      const { accessToken, token } = response.data;
      
      // Store tokens
      localStorage.setItem('jwt_token', token);
      localStorage.setItem('kite_access_token', accessToken);
      localStorage.setItem('last_login', new Date().toISOString());
      
      return response.data;
    } catch (error: any) {
      console.error('Callback error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // If token expired, redirect to login
      if (error.response?.data?.message?.includes('Token is invalid or has expired')) {
        console.log('Token expired, redirecting to login...');
        // Clear any stored tokens
        localStorage.removeItem('last_handled_token');
        localStorage.removeItem('last_handled_time');
        // Get fresh login URL
        const loginResponse = await auth.login();
        window.location.href = loginResponse.loginUrl;
        return;
      }
      
      throw error;
    }
  }
};

export const market = {
  getQuote: async (symbol: string) => {
    try {
      const response = await api.get(`/market/quote/${symbol}`);
      return response.data;
    } catch (error) {
      console.error('Get quote error:', error);
      throw error;
    }
  },

  getOHLC: async (symbol: string) => {
    try {
      const response = await api.get(`/market/ohlc/${symbol}`);
      return response.data;
    } catch (error) {
      console.error('Get OHLC error:', error);
      throw error;
    }
  },

  getLTP: async (symbol: string) => {
    try {
      const response = await api.get(`/market/ltp/${symbol}`);
      return response.data;
    } catch (error) {
      console.error('Get LTP error:', error);
      throw error;
    }
  },

  getStatus: async () => {
    try {
      const response = await api.get('/market/status');
      return response.data;
    } catch (error) {
      console.error('Get market status error:', error);
      throw error;
    }
  }
};

export default api; 