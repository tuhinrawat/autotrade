const http = require('http');
const app = require('./app');
const config = require('./config');
const WebSocketServer = require('./websocket');
const authRoutes = require('./routes/auth');
const ordersRoutes = require('./routes/orders');
const backtestRoutes = require('./routes/backtest');
const instrumentsRoutes = require('./routes/instruments');

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wsServer = new WebSocketServer(server, config.websocket.path);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/instruments', instrumentsRoutes);

// Start server
const port = config.port;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${config.env}`);
  console.log(`MongoDB URI: ${config.mongoUri}`);
  console.log(`CORS origin: ${config.cors.origin}`);
  console.log(`WebSocket path: ${config.websocket.path}`);
}); 