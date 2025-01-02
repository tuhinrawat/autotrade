const express = require('express');
const router = express.Router();
const KiteConnect = require('kiteconnect').KiteConnect;
const User = require('../models/User.js');
const jwt = require('jsonwebtoken');

// Rate limiting variables
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second between requests

// Middleware to verify JWT token and attach user to request
const authenticateToken = async (req, res, next) => {
  console.log('Authenticating request...');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No token provided in Authorization header');
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    console.log('JWT Token:', token);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('Decoded token:', decoded);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('User not found for id:', decoded.userId);
      return res.status(404).json({ message: 'User not found' });
    }
    console.log('Found user:', user._id);

    // Get Kite access token from user model
    const kiteAccessToken = user.kiteAccessToken;
    if (!kiteAccessToken) {
      console.log('No Kite access token found for user:', user._id);
      return res.status(401).json({ message: 'No Kite access token found' });
    }
    console.log('Kite access token found');

    req.user = user;
    req.kiteAccessToken = kiteAccessToken;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid token', error: error.message });
  }
};

// Helper function to handle rate limiting
const waitForRateLimit = () => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    return new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  return Promise.resolve();
};

// Get all orders
router.get('/', authenticateToken, async (req, res) => {
  console.log('GET /orders - Fetching orders and positions for user:', req.user._id);
  
  try {
    // Wait for rate limit if needed
    await waitForRateLimit();
    lastRequestTime = Date.now();

    const kiteAccessToken = req.headers['x-kite-access-token'];
    if (!kiteAccessToken) {
      return res.status(401).json({ error: 'No Kite access token provided' });
    }

    console.log('Initializing Kite connection...');
    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY
    });
    
    console.log('Setting access token:', kiteAccessToken);
    kite.setAccessToken(kiteAccessToken);

    console.log('Fetching orders, positions, and trades from Kite API...');
    const [orders, positions, trades, holdings] = await Promise.all([
      kite.getOrders().catch(error => {
        console.error('Error fetching orders:', error.message);
        return [];
      }),
      kite.getPositions().catch(error => {
        console.error('Error fetching positions:', error.message);
        return { net: [], day: [] };
      }),
      kite.getTrades().catch(error => {
        console.error('Error fetching trades:', error.message);
        return [];
      }),
      kite.getHoldings().catch(error => {
        console.error('Error fetching holdings:', error.message);
        return [];
      })
    ]);
    
    console.log('Raw orders received:', JSON.stringify(orders, null, 2));
    console.log('Raw positions received:', JSON.stringify(positions, null, 2));
    console.log('Raw trades received:', JSON.stringify(trades, null, 2));
    console.log('Raw holdings received:', JSON.stringify(holdings, null, 2));

    // Create a map of trades by order_id for quick lookup
    const tradesMap = new Map();
    trades.forEach(trade => {
      if (!tradesMap.has(trade.order_id)) {
        tradesMap.set(trade.order_id, []);
      }
      tradesMap.get(trade.order_id).push(trade);
    });
    
    // Log the transformed data at each step
    console.log('Trades map:', Object.fromEntries(tradesMap));
    
    // Ensure orders is an array
    const orderArray = Array.isArray(orders) ? orders : [];
    console.log('Order array:', JSON.stringify(orderArray, null, 2));

    // Transform orders with trade information
    const transformedOrders = orderArray
      .filter(order => order.status === 'COMPLETE') // Only include completed orders
      .map(order => {
        // Get trades for this order
        const orderTrades = tradesMap.get(order.order_id) || [];
        console.log(`Processing order ${order.order_id}:`, {
          order,
          orderTrades,
          position: positions.net?.find(pos => 
            pos.tradingsymbol === order.tradingsymbol && 
            pos.product === order.product
          )
        });
        
        // Calculate average fill price from trades
        const totalValue = orderTrades.reduce((sum, trade) => sum + (trade.quantity * trade.price), 0);
        const totalQuantity = orderTrades.reduce((sum, trade) => sum + trade.quantity, 0);
        const averagePrice = totalQuantity > 0 ? totalValue / totalQuantity : order.average_price;

        // Find matching position for this order
        const position = positions.net?.find(pos => 
          pos.tradingsymbol === order.tradingsymbol && 
          pos.product === order.product
        );

        // A trade is considered open if there's a matching position with non-zero quantity
        const isOpen = position ? Math.abs(position.quantity) > 0 : false;

        return {
          order_id: order.order_id || '',
          tradingsymbol: order.tradingsymbol || '',
          exchange: order.exchange || '',
          transaction_type: order.transaction_type || 'BUY',
          quantity: order.quantity || 0,
          average_price: averagePrice || 0,
          product: order.product || '',
          status: isOpen ? 'OPEN' : order.status,
          order_timestamp: order.order_timestamp || new Date().toISOString(),
          instrument_token: order.instrument_token || null,
          filled_quantity: totalQuantity || order.filled_quantity || 0,
          pending_quantity: order.pending_quantity || 0,
          cancelled_quantity: order.cancelled_quantity || 0,
          ltp: position?.last_price || 0,
          pnl: position?.pnl || 0,
          pnl_percentage: position ? (position.pnl / (position.average_price * Math.abs(position.quantity))) * 100 : 0,
          trade_type: order.tags?.includes('automated') ? 'AUTO' : 'MANUAL',
          is_open: isOpen
        };
      });

    console.log('Transformed orders:', JSON.stringify(transformedOrders, null, 2));

    // Add net positions to active trades
    const netPositions = positions.net || [];
    console.log('Net positions:', JSON.stringify(netPositions, null, 2));

    // Add holdings to active trades
    const holdingTrades = holdings
      .filter(holding => holding.quantity > 0 || holding.t1_quantity > 0)  // Include T+1 holdings
      .map(holding => {
        console.log(`Processing holding for ${holding.tradingsymbol}:`, holding);
        const totalQuantity = (holding.quantity || 0) + (holding.t1_quantity || 0);
        return {
          order_id: `HOLD_${holding.tradingsymbol}`,
          tradingsymbol: holding.tradingsymbol,
          exchange: holding.exchange,
          transaction_type: 'BUY',
          quantity: totalQuantity,
          average_price: holding.average_price,
          product: 'CNC',
          status: 'HOLDING',
          order_timestamp: new Date(holding.last_price_date || new Date()).toISOString(),
          instrument_token: holding.instrument_token,
          ltp: holding.last_price || 0,
          pnl: holding.pnl || 0,
          pnl_percentage: holding.average_price ? ((holding.last_price - holding.average_price) / holding.average_price) * 100 : 0,
          trade_type: 'MANUAL',
          is_open: true,
          collateral_quantity: holding.collateral_quantity,
          collateral_type: holding.collateral_type,
          t1_quantity: holding.t1_quantity,
          realised_quantity: holding.realised_quantity,
          used_quantity: holding.used_quantity
        };
      });

    console.log('Holding trades:', JSON.stringify(holdingTrades, null, 2));

    const positionTrades = netPositions
      .filter(position => Math.abs(position.quantity) > 0)
      .map(position => {
        console.log(`Processing position for ${position.tradingsymbol}:`, position);
        return {
          order_id: `POS_${position.tradingsymbol}`,
          tradingsymbol: position.tradingsymbol,
          exchange: position.exchange,
          transaction_type: position.quantity > 0 ? 'BUY' : 'SELL',
          quantity: Math.abs(position.quantity),
          average_price: position.average_price,
          product: position.product,
          status: 'OPEN',
          order_timestamp: new Date().toISOString(),
          instrument_token: position.instrument_token,
          ltp: position.last_price || 0,
          pnl: position.pnl || 0,
          pnl_percentage: position.average_price ? (position.pnl / (position.average_price * Math.abs(position.quantity))) * 100 : 0,
          trade_type: position.tags?.includes('automated') ? 'AUTO' : 'MANUAL',
          is_open: true,
          day_m2m: position.day_m2m,
          overnight_quantity: position.overnight_quantity,
          multiplier: position.multiplier,
          value: position.value
        };
      });

    console.log('Position trades:', JSON.stringify(positionTrades, null, 2));

    // Combine orders, positions and holdings
    const activeTrades = [...transformedOrders, ...positionTrades, ...holdingTrades];
    console.log('Final active trades:', JSON.stringify(activeTrades, null, 2));
    
    // Get instrument tokens for all active trades
    const instrumentTokens = activeTrades
      .map(trade => trade.instrument_token)
      .filter(token => token != null);

    // Fetch current market quotes for all instruments
    if (instrumentTokens.length > 0) {
      try {
        const quotes = await kite.getQuote(instrumentTokens);
        
        // Update trades with current market prices
        activeTrades.forEach(trade => {
          if (trade.instrument_token && quotes[trade.instrument_token]) {
            const quote = quotes[trade.instrument_token];
            trade.ltp = quote.last_price;
            
            // Calculate P&L
            if (trade.average_price && trade.ltp) {
              trade.pnl = trade.transaction_type === 'BUY'
                ? (trade.ltp - trade.average_price) * trade.quantity
                : (trade.average_price - trade.ltp) * trade.quantity;
              
              trade.pnl_percentage = (trade.pnl / (trade.average_price * trade.quantity)) * 100;
            }
          }
        });
      } catch (error) {
        console.error('Error fetching quotes:', error);
        // Continue without quotes if there's an error
      }
    }
    
    console.log('Sending active trades:', activeTrades);
    res.json(activeTrades);
  } catch (error) {
    console.error('Error fetching orders:', error);
    
    // Handle rate limit error specifically
    if (error.message && error.message.includes('Too many requests')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again in a moment.',
        retryAfter: MIN_REQUEST_INTERVAL
      });
    }
    
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Create new order
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Wait for rate limit if needed
    await waitForRateLimit();
    lastRequestTime = Date.now();

    const { 
      symbol, 
      type, 
      quantity, 
      price,
      product = 'CNC',
      validity = 'DAY',
      disclosed_quantity = 0,
      trigger_price = 0,
      squareoff = 0,
      stoploss = 0,
      trailing_stoploss = 0,
      variety = 'regular'
    } = req.body;

    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY
    });
    kite.setAccessToken(req.kiteAccessToken);

    // Place order using Kite API
    const order = await kite.placeOrder(variety, {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: type,
      quantity: quantity,
      price: price,
      product: product,
      order_type: price > 0 ? 'LIMIT' : 'MARKET',
      validity: validity,
      disclosed_quantity: disclosed_quantity,
      trigger_price: trigger_price,
      squareoff: squareoff,
      stoploss: stoploss,
      trailing_stoploss: trailing_stoploss
    });

    res.status(201).json({
      order_id: order.order_id,
      tradingsymbol: symbol,
      transaction_type: type,
      quantity: quantity,
      price: price,
      product: product,
      validity: validity,
      variety: variety,
      status: 'PENDING',
      order_timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating order:', error);
    
    // Handle rate limit error specifically
    if (error.message && error.message.includes('Too many requests')) {
      return res.status(429).json({ 
        message: 'Rate limit exceeded. Please try again in a moment.',
        retryAfter: MIN_REQUEST_INTERVAL
      });
    }
    
    res.status(500).json({ message: 'Failed to create order', error: error.message });
  }
});

module.exports = router; 