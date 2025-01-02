export const AUTH_CONFIG = {
  // Default API credentials from environment
  DEFAULT_API_KEY: import.meta.env.VITE_KITE_API_KEY || '',
  DEFAULT_API_SECRET: import.meta.env.VITE_KITE_API_SECRET || '',
  
  // Storage keys
  STORAGE_KEYS: {
    API_KEY: 'kite_api_key',
    API_SECRET: 'kite_api_secret',
    ACCESS_TOKEN: 'kite_access_token',
    JWT_TOKEN: 'jwt_token',
    LAST_LOGIN: 'last_login',
    USER_PROFILE: 'user_profile'
  },

  // API endpoints
  ENDPOINTS: {
    LOGIN: '/auth/login',
    CALLBACK: '/auth/callback',
    VALIDATE: '/auth/validate',
    USER: '/auth/user'
  },

  // Token expiry in days
  TOKEN_EXPIRY_DAYS: 7,
  
  // Redirect URLs
  REDIRECT_URLS: {
    AFTER_LOGIN: '/dashboard',
    AFTER_LOGOUT: '/login'
  }
}; 