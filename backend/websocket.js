const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const KiteService = require('./services/kite.service');
const logger = require('./utils/logger');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });
    
    // Track clients and their subscriptions
    this.clients = new Map();
    this.subscriptions = new Map();
    
    this.init();
    logger.info('WebSocket server initialized');
  }

  init() {
    this.wss.on('connection', async (ws, req) => {
      try {
        const { token, userId } = await this.authenticate(req);
        if (!token || !userId) {
          ws.close(1008, 'Authentication failed');
          return;
        }

        // Store client info
        this.clients.set(ws, { userId, token });
        logger.info(`Client connected: ${userId}`);

        ws.on('message', async (message) => {
          try {
            const data = JSON.parse(message);
            if (data.type === 'subscribe' && Array.isArray(data.tokens)) {
              await this.handleSubscribe(ws, data.tokens);
            }
          } catch (error) {
            logger.error('Error handling message:', error);
          }
        });

        ws.on('close', () => {
          this.handleDisconnect(ws);
        });

        ws.on('error', (error) => {
          logger.error('WebSocket error:', error);
          this.handleDisconnect(ws);
        });

      } catch (error) {
        logger.error('Connection error:', error);
        ws.close(1011, 'Internal server error');
      }
    });
  }

  async authenticate(req) {
    try {
      const url = new URL(req.url, 'ws://localhost');
      const token = url.searchParams.get('token');
      const jwtToken = url.searchParams.get('jwt');

      if (!token || !jwtToken) {
        return { token: null, userId: null };
      }

      const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return { token: null, userId: null };
      }

      return { token, userId: user._id };
    } catch (error) {
      logger.error('Authentication error:', error);
      return { token: null, userId: null };
    }
  }

  async handleSubscribe(ws, tokens) {
    try {
      const client = this.clients.get(ws);
      if (!client) return;

      // Update subscriptions
      this.subscriptions.set(ws, tokens);

      // Initialize Kite connection if needed
      const kiteService = new KiteService(client.token);
      
      // Start sending ticks for subscribed tokens
      const sendTicks = async () => {
        try {
          const ticks = await kiteService.getTicks(tokens);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'tick', ticks }));
          }
        } catch (error) {
          logger.error('Error sending ticks:', error);
        }
      };

      // Send initial ticks
      await sendTicks();

      // Set up periodic updates (every 5 seconds)
      const interval = setInterval(sendTicks, 5000);
      ws.interval = interval;

    } catch (error) {
      logger.error('Subscription error:', error);
    }
  }

  handleDisconnect(ws) {
    // Clear intervals
    if (ws.interval) {
      clearInterval(ws.interval);
    }

    // Remove from tracking
    this.clients.delete(ws);
    this.subscriptions.delete(ws);
    
    logger.info('Client disconnected');
  }
}

module.exports = WebSocketServer; 