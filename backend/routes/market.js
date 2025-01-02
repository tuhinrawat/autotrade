const express = require('express');
const router = express.Router();
const KiteConnect = require('kiteconnect').KiteConnect;
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token and attach user to request
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Helper function to check if market is open
function isMarketOpen() {
  const now = new Date();
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 100 + minutes;

  // Market is closed on weekends (Saturday = 6, Sunday = 0)
  if (day === 0 || day === 6) {
    return false;
  }

  // Market is open between 9:15 AM and 3:30 PM IST on weekdays
  return currentTime >= 915 && currentTime <= 1530;
}

// Market status endpoint - no auth required
router.get('/status', (req, res) => {
  try {
    const isOpen = isMarketOpen();
    res.json({
      isOpen,
      timestamp: new Date().toISOString(),
      message: isOpen ? 'Market is open' : 'Market is closed'
    });
  } catch (error) {
    console.error('Error checking market status:', error);
    res.status(500).json({ error: 'Failed to check market status' });
  }
});

// Get quotes for instruments - requires auth
router.get('/quotes', authenticateToken, async (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) {
      return res.status(400).json({ message: 'Symbols are required' });
    }

    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY
    });
    kite.setAccessToken(req.user.kiteAccessToken);

    const instruments = symbols.split(',').map(s => s.trim());
    const quotes = await kite.getQuote(instruments);

    res.json(quotes);
  } catch (error) {
    console.error('Error fetching quotes:', error);
    res.status(500).json({ message: 'Failed to fetch quotes', error: error.message });
  }
});

module.exports = router; 