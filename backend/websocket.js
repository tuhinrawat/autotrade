const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const KiteService = require('./services/kite.service');
const logger = require('./utils/logger');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      clientTracking: true,
      maxPayload: 1024 * 1024 // 1MB max message size
    });
    
    // Track clients and their subscriptions
    this.clients = new Map();
    this.subscriptions = new Map();
    
    this.init();
    logger.info('WebSocket server initialized with config:', {
      path: '/ws',
      clientTracking: true,
      maxPayload: '1MB'
    });
  }

  init() {
    this.wss.on('connection', async (ws, req) => {
      try {
        logger.info('New WebSocket connection attempt from:', req.socket.remoteAddress);
        
        const { token, userId } = await this.authenticate(req);
        if (!token || !userId) {
          logger.error('Authentication failed, closing connection');
          ws.close(1008, 'Authentication failed');
          return;
        }

        // Store client info
        this.clients.set(ws, { userId, token });
        logger.info('Client connected successfully:', { userId });

        // Set up ping-pong to detect stale connections
        ws.isAlive = true;
        ws.on('pong', () => {
          ws.isAlive = true;
        });

        ws.on('message', async (message) => {
          try {
            const data = JSON.parse(message.toString());
            logger.info('Received message:', { type: data.type, userId });
            
            if (data.type === 'subscribe' && Array.isArray(data.tokens)) {
              await this.handleSubscribe(ws, data.tokens);
            }
          } catch (error) {
            logger.error('Error handling message:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          }
        });

        ws.on('close', (code, reason) => {
          logger.info('Client disconnected:', { userId, code, reason });
          this.handleDisconnect(ws);
        });

        ws.on('error', (error) => {
          logger.error('WebSocket error:', { userId, error: error.message });
          this.handleDisconnect(ws);
        });

      } catch (error) {
        logger.error('Connection error:', error);
        ws.close(1011, 'Internal server error');
      }
    });

    // Set up ping interval to detect stale connections
    const pingInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          logger.info('Terminating stale connection');
          return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(pingInterval);
    });
  }

  async authenticate(req) {
    try {
      const url = new URL(req.url, 'ws://localhost');
      const token = url.searchParams.get('token');
      const jwtToken = url.searchParams.get('jwt');

      if (!token || !jwtToken) {
        logger.error('Missing authentication tokens:', { hasToken: !!token, hasJwt: !!jwtToken });
        return { token: null, userId: null };
      }

      // Verify JWT token
      const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
      if (!decoded || !decoded.userId) {
        logger.error('Invalid JWT token');
        return { token: null, userId: null };
      }

      // Find user and verify Kite token
      const user = await User.findById(decoded.userId);
      if (!user) {
        logger.error('User not found:', decoded.userId);
        return { token: null, userId: null };
      }

      if (user.kiteAccessToken !== token) {
        logger.error('Kite token mismatch');
        return { token: null, userId: null };
      }

      logger.info('Authentication successful:', {
        userId: user._id,
        email: user.email
      });

      return { token, userId: user._id };
    } catch (error) {
      logger.error('Authentication error:', error);
      return { token: null, userId: null };
    }
  }

  async handleSubscribe(ws, tokens) {
    try {
      const client = this.clients.get(ws);
      if (!client) {
        logger.error('Client not found for subscription');
        return;
      }

      // Update subscriptions
      this.subscriptions.set(ws, tokens);
      logger.info('Subscribed to tokens:', {
        userId: client.userId,
        tokens
      });

      // Initialize Kite connection
      const kiteService = new KiteService(process.env.KITE_API_KEY);
      kiteService.setAccessToken(client.token);
      
      // Start sending ticks for subscribed tokens
      const sendTicks = async () => {
        try {
          const response = await kiteService.getTicks(tokens);
          if (!response.success) {
            logger.error('Failed to get ticks:', response.error);
            return;
          }
          
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'tick', ticks: response.data }));
          }
        } catch (error) {
          logger.error('Error sending ticks:', error);
          // Close connection if Kite token is invalid
          if (error.message?.includes('Invalid token')) {
            ws.close(1008, 'Invalid Kite token');
          }
        }
      };

      // Send initial ticks
      await sendTicks();

      // Set up periodic updates (every 5 seconds to avoid rate limiting)
      const interval = setInterval(sendTicks, 5000);
      ws.interval = interval;

    } catch (error) {
      logger.error('Subscription error:', error);
      ws.close(1011, 'Subscription failed');
    }
  }

  handleDisconnect(ws) {
    const client = this.clients.get(ws);
    
    // Clear intervals
    if (ws.interval) {
      clearInterval(ws.interval);
    }

    // Remove from tracking
    this.clients.delete(ws);
    this.subscriptions.delete(ws);
    
    if (client) {
      logger.info('Client disconnected:', {
        userId: client.userId
      });
    }
  }
}

module.exports = WebSocketServer; 