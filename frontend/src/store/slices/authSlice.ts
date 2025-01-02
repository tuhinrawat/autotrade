import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AUTH_CONFIG } from '../../config/auth';

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  user: {
    id?: string;
    email?: string;
    name?: string;
    accessToken?: string;
    token?: string;
    balance?: number;
  } | null;
}

// Helper function to check stored tokens
const getStoredTokens = () => {
  const accessToken = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
  const jwtToken = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.JWT_TOKEN);
  const lastLogin = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.LAST_LOGIN);
  const userProfile = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.USER_PROFILE);

  console.log('Checking stored tokens:', {
    hasAccessToken: !!accessToken,
    hasJwtToken: !!jwtToken,
    hasLastLogin: !!lastLogin,
    hasProfile: !!userProfile
  });

  // Check if tokens exist and last login is within expiry period
  if (accessToken && jwtToken && lastLogin) {
    const loginTime = new Date(lastLogin).getTime();
    const now = new Date().getTime();
    const daysSinceLogin = (now - loginTime) / (1000 * 60 * 60 * 24);
    
    console.log('Token validation:', {
      daysSinceLogin,
      isValid: daysSinceLogin <= AUTH_CONFIG.TOKEN_EXPIRY_DAYS
    });

    if (daysSinceLogin <= AUTH_CONFIG.TOKEN_EXPIRY_DAYS) {
      const user = userProfile ? JSON.parse(userProfile) : null;
      return {
        isAuthenticated: true,
        accessToken,
        token: jwtToken,
        user
      };
    }
  }

  // Clear expired tokens
  Object.values(AUTH_CONFIG.STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });

  return {
    isAuthenticated: false,
    accessToken: null,
    token: null,
    user: null
  };
};

const storedTokens = getStoredTokens();

const initialState: AuthState = {
  isAuthenticated: storedTokens.isAuthenticated,
  loading: false,
  error: null,
  user: storedTokens.isAuthenticated ? {
    ...storedTokens.user,
    accessToken: storedTokens.accessToken,
    token: storedTokens.token
  } : null
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (state, action: PayloadAction<any>) => {
      console.log('Login success action:', action.payload);
      
      state.isAuthenticated = true;
      state.user = action.payload;
      state.loading = false;
      state.error = null;

      // Store tokens and user data
      if (action.payload.accessToken) {
        localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.ACCESS_TOKEN, action.payload.accessToken);
      }
      if (action.payload.token) {
        localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.JWT_TOKEN, action.payload.token);
      }
      localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.LAST_LOGIN, new Date().toISOString());
      localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.USER_PROFILE, JSON.stringify({
        id: action.payload.id,
        name: action.payload.name,
        email: action.payload.email,
        balance: action.payload.balance
      }));

      console.log('Updated auth state:', {
        isAuthenticated: state.isAuthenticated,
        hasUser: !!state.user,
        userId: state.user?.id
      });
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
      state.isAuthenticated = false;
      state.user = null;

      // Clear all auth data
      Object.values(AUTH_CONFIG.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.loading = false;
      state.error = null;

      // Clear all auth data
      Object.values(AUTH_CONFIG.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    },
    updateBalance: (state, action: PayloadAction<number>) => {
      if (state.user) {
        state.user.balance = action.payload;
        
        // Update stored profile with new balance
        const profile = localStorage.getItem(AUTH_CONFIG.STORAGE_KEYS.USER_PROFILE);
        if (profile) {
          const updatedProfile = { ...JSON.parse(profile), balance: action.payload };
          localStorage.setItem(AUTH_CONFIG.STORAGE_KEYS.USER_PROFILE, JSON.stringify(updatedProfile));
        }
      }
    }
  }
});

export const { loginStart, loginSuccess, loginFailure, logout, updateBalance } = authSlice.actions;
export default authSlice.reducer; 