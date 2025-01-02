const express = require('express');
const router = express.Router();
const authRoutes = require('./auth.js');
const backtestRoutes = require('./backtest.js');
const ordersRoutes = require('./orders.js');
const profileRoutes = require('./profile.js');
const instrumentsRoutes = require('./instruments.js');
const marketRoutes = require('./market.js');

// Mount routes
router.use('/auth', authRoutes);
router.use('/backtest', backtestRoutes);
router.use('/orders', ordersRoutes);
router.use('/profile', profileRoutes);
router.use('/instruments', instrumentsRoutes);
router.use('/market', marketRoutes);

module.exports = router; 