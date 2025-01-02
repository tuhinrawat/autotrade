const express = require('express');
const router = express.Router();
const Trade = require('../models/Trade');
const auth = require('../middleware/auth');

// Get all trades for a user
router.get('/', auth, async (req, res) => {
  try {
    const trades = await Trade.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(trades);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new trade
router.post('/', auth, async (req, res) => {
  try {
    const { symbol, type, quantity, price } = req.body;
    const totalAmount = quantity * price;

    // Check if user has enough balance for buy
    if (type === 'BUY' && req.user.balance < totalAmount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const trade = new Trade({
      user: req.user._id,
      symbol,
      type,
      quantity,
      price,
      totalAmount
    });

    // Update user balance
    if (type === 'BUY') {
      req.user.balance -= totalAmount;
    } else {
      req.user.balance += totalAmount;
    }

    await Promise.all([
      trade.save(),
      req.user.save()
    ]);

    res.status(201).json({ trade, newBalance: req.user.balance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get trade by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const trade = await Trade.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }

    res.json(trade);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 