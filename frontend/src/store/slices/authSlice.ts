import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UserProfile {
  user_name: string;
  email: string;
  user_type?: string;
  broker?: string;
  exchanges?: string[];
  products?: string[];
  order_types?: string[];
}

interface User {
  id?: string;
  email?: string;
  name?: string;
  balance?: number;
  accessToken?: string;
  token?: string;  // JWT token
  apiKey?: string;
  profile?: UserProfile;
}

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  user: User | null;
}

// Helper function to check stored tokens
const getStoredTokens = () => {
  const kiteAccessToken = localStorage.getItem('kite_access_token');
  const jwtToken = localStorage.getItem('jwt_token');
  const lastLogin = localStorage.getItem('last_login');

  // Check if tokens exist and last login is within 7 days
  if (kiteAccessToken && jwtToken && lastLogin) {
    const loginTime = new Date(lastLogin).getTime();
    const now = new Date().getTime();
    const daysSinceLogin = (now - loginTime) / (1000 * 60 * 60 * 24);
    if (daysSinceLogin <= 7) {
      return {
        isAuthenticated: true,
        accessToken: kiteAccessToken as string,
        token: jwtToken as string
      };
    }
  }
  return {
    isAuthenticated: false,
    accessToken: undefined,
    token: undefined
  };
};

const storedTokens = getStoredTokens();

const initialState: AuthState = {
  isAuthenticated: storedTokens.isAuthenticated,
  loading: false,
  error: null,
  user: storedTokens.isAuthenticated ? {
    accessToken: storedTokens.accessToken,
    token: storedTokens.token
  } as User : null
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.isAuthenticated = true;
      state.user = action.payload;
      state.loading = false;
      state.error = null;
      if (action.payload.accessToken) {
        localStorage.setItem('kite_access_token', action.payload.accessToken);
      }
      if (action.payload.token) {
        localStorage.setItem('jwt_token', action.payload.token);
      }
      localStorage.setItem('last_login', new Date().toISOString());
    },
    updateBalance: (state, action: PayloadAction<number>) => {
      if (state.user) {
        state.user.balance = action.payload;
      }
    },
    loginStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (state, action: PayloadAction<User>) => {
      state.isAuthenticated = true;
      state.user = action.payload;
      state.loading = false;
      state.error = null;
      // Store both tokens
      if (action.payload.accessToken) {
        localStorage.setItem('kite_access_token', action.payload.accessToken);
      }
      if (action.payload.token) {
        localStorage.setItem('jwt_token', action.payload.token);
      }
      localStorage.setItem('last_login', new Date().toISOString());
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
      state.isAuthenticated = false;
      state.user = null;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.loading = false;
      state.error = null;
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('kite_access_token');
      localStorage.removeItem('last_login');
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    }
  }
});

export const { 
  setUser, 
  updateBalance, 
  loginStart, 
  loginSuccess,
  loginFailure, 
  logout, 
  setLoading 
} = authSlice.actions;

export default authSlice.reducer; 