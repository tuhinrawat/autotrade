require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 8000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trader',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  sessionSecret: process.env.SESSION_SECRET || 'your-session-secret',
  kite: {
    apiKey: process.env.KITE_API_KEY,
    apiSecret: process.env.KITE_API_SECRET,
    requestTimeout: 5000,
    debug: process.env.NODE_ENV === 'development'
  },
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  },
  mongo: {
    options: {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 10000
    }
  },
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: {
      enabled: true,
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }
  },
  cache: {
    ttl: 60 * 60 * 1000, // 1 hour
    checkPeriod: 60 * 60 * 1000 // 1 hour
  },
  websocket: {
    path: '/ws',
    pingInterval: 30000,
    pingTimeout: 5000
  }
};

// Validate required environment variables
const requiredEnvVars = ['KITE_API_KEY', 'KITE_API_SECRET', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

module.exports = config; 