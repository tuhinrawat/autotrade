const mongoose = require('mongoose');

const backtestTradeSchema = new mongoose.Schema({
  entryTime: {
    type: String,
    required: true
  },
  exitTime: {
    type: String,
    required: true
  },
  entryPrice: {
    type: Number,
    required: true
  },
  exitPrice: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  pnl: {
    type: Number,
    required: true
  },
  pnlPercent: {
    type: Number,
    required: true
  },
  exitReason: {
    type: String,
    enum: ['TARGET', 'STOPLOSS', 'SIGNAL'],
    required: true
  }
});

const backtestResultSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  strategy: {
    type: String,
    required: true
  },
  timeframe: {
    type: String,
    required: true
  },
  startDate: {
    type: String,
    required: true
  },
  endDate: {
    type: String,
    required: true
  },
  investment: {
    type: Number,
    required: true
  },
  profitTarget: {
    type: Number,
    required: true
  },
  stopLoss: {
    type: Number,
    required: true
  },
  instrument: {
    token: {
      type: Number,
      required: true
    },
    symbol: {
      type: String,
      required: true
    },
    exchange: {
      type: String,
      required: true
    }
  },
  totalTrades: {
    type: Number,
    required: true
  },
  winRate: {
    type: Number,
    required: true
  },
  totalPnL: {
    type: Number,
    required: true
  },
  maxDrawdown: {
    type: Number,
    required: true
  },
  averageProfit: {
    type: Number,
    required: true
  },
  averageLoss: {
    type: Number,
    required: true
  },
  trades: [backtestTradeSchema]
}, {
  timestamps: true
});

const BacktestResult = mongoose.model('BacktestResult', backtestResultSchema);
module.exports = BacktestResult; 