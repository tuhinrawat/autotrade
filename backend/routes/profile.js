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

// Get user profile and account details
router.get('/', authenticateToken, async (req, res) => {
  try {
    const kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY
    });
    kite.setAccessToken(req.user.kiteAccessToken);

    // Get latest profile and margin details
    const [profile, margins] = await Promise.all([
      kite.getProfile(),
      kite.getMargins()
    ]);

    // Update user's balance
    req.user.balance = margins.equity.available.live_balance || margins.equity.available.cash || 0;
    await req.user.save();

    // Return complete account details
    res.json({
      user_id: profile.user_id,
      user_name: profile.user_name,
      email: profile.email,
      user_type: profile.user_type,
      broker: 'Zerodha',
      exchanges: profile.exchanges || [],
      products: profile.products || [],
      order_types: profile.order_types || [],
      balance: req.user.balance,
      margins: {
        equity: margins.equity
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
  }
});

module.exports = router; 